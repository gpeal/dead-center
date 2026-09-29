import { KEY, edist, quality, focusCode, type KeyDef } from './keys';
import { buzz, sound } from './feedback';
import { linesFor } from './game';
import { allTaps, commitTaps, realSessions, save, store, toObj, type Mode, type Session, type Tap, type TapRow } from './store';
import { dayDiff, today } from './util';
import type { Point, ShiftState } from './keyboard';

export type CharState = 'ok' | 'miss' | 'case' | 'fixed' | 'skip';
export interface Hint { tone: 'ok' | 'warn' | 'bad'; label: string; text: string }
export interface RoundResult {
  sess: Session; taps: Tap[]; pbW: boolean;
  caseSlips: number; realigns: number; maxBull: number;
}
interface Ev { hit: string; down: Point; dt: number; snap: Snap; pos: number; ok: boolean; keyOk: boolean }
const SNAP_KEYS = ['ci', 'scored', 'good', 'precSum', 'precN', 'combo', 'maxCombo', 'bull', 'maxBull', 'caseSlips', 'shift'] as const;
type SnapKey = (typeof SNAP_KEYS)[number];
type Snap = { state: CharState[]; tapsLen: number } & Pick<Round, SnapKey>;

/** One practice round. Mutable on purpose: the screen re-renders from it after every tap via subscribe(). */
export class Round {
  lines: string[];
  li = 0; ci = 0; state: CharState[] = []; taps: TapRow[] = [];
  t0 = 0; tLast = 0; combo = 0; maxCombo = 0; bull = 0; maxBull = 0;
  scored = 0; good = 0; precSum = 0; precN = 0; caseSlips = 0; shift: ShiftState = 'on'; lastShiftT = 0;
  hist: Ev[] = []; realigns = 0; sid = Date.now(); done = false;
  // one-shot UI effects, each with a counter so the screen can restart the animation
  shake = { i: -1, n: 0 }; hint: Hint | null = null; private hintT = 0;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(public mode: Mode, public focus: string[], private onFinish: (r: RoundResult) => void) {
    this.lines = linesFor(mode, focus);
  }
  subscribe = (l: () => void) => (this.listeners.add(l), () => this.listeners.delete(l));
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  get line() { return this.lines[this.li]; }

  // which key the current character needs next: Shift first when a capital is due and Shift is off
  private expectedKey() {
    const ch = this.line[this.ci];
    if (ch === ' ') return 'space';
    const lo = ch.toLowerCase();
    return ch !== lo && this.shift === 'off' ? 'shift' : lo;
  }
  private record(tk: string, hit: string, down: Point, dt: number, prev: string) {
    const key = KEY[tk], dx = down.x - key.cx, dy = down.y - key.cy;
    this.taps.push([this.sid, tk, hit, Math.round(dx * 10), Math.round(dy * 10), prev, Math.min(dt, 9999)]);
    return { dx, dy, key };
  }
  // counts a tap toward accuracy, centering, combo and bullseye runs
  private grade(ok: boolean, r: { dx: number; dy: number; key: KeyDef }) {
    this.scored++;
    if (!ok) {
      this.combo = 0;
      this.bull = 0;
      return;
    }
    this.good++;
    const q = quality(r.dx, r.dy, r.key);
    this.precSum += 1 - Math.min(1, edist(r.dx, r.dy, r.key));
    this.precN++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (q === 'bull') {
      this.bull++;
      this.maxBull = Math.max(this.maxBull, this.bull);
    } else this.bull = 0;
  }
  private shakeAt(i: number) {
    this.shake = { i, n: this.shake.n + 1 };
  }

  /* ---- realignment: undo and replay the last few keystrokes when the typist has slipped one letter out of step ---- */
  private snapshot(): Snap {
    const s = { state: this.state.slice(), tapsLen: this.taps.length } as Snap;
    for (const k of SNAP_KEYS) (s as Record<string, unknown>)[k] = this[k];
    return s;
  }
  private restore(s: Snap) {
    for (const k of SNAP_KEYS) (this as Record<string, unknown>)[k] = s[k];
    this.state = s.state.slice();
    this.taps.length = s.tapsLen;
  }
  // type the current character with one tap; returns what happened so it can be undone later
  private typeKey(hit: string, down: Point, dt: number): Ev {
    const line = this.line, ch = line[this.ci], exp = this.expectedKey(), tk = exp === 'shift' ? ch.toLowerCase() : exp;
    const prev = this.ci > 0 ? (line[this.ci - 1] === ' ' ? '_' : line[this.ci - 1].toLowerCase()) : '';
    const snap = this.snapshot(), r = this.record(tk, hit, down, dt, prev);
    const keyOk = hit === tk;
    let ok = keyOk;
    if (keyOk && tk !== 'space' && (this.shift !== 'off') !== (ch !== ch.toLowerCase())) {
      ok = false;
      this.caseSlips++;
    }
    this.grade(ok, r);
    this.state[this.ci] = ok ? (this.state[this.ci] === 'miss' ? 'fixed' : 'ok') : keyOk ? 'case' : 'miss';
    if (this.shift === 'on') this.shift = 'off';
    const pos = this.ci;
    this.ci++;
    return { hit, down, dt, snap, pos, ok, keyOk };
  }
  private replay(evs: Ev[]) {
    this.hist = [];
    for (const e of evs) this.hist.push(this.typeKey(e.hit, e.down, e.dt));
  }
  private tryRealign(): { type: 'skip'; chars: string } | { type: 'double' | 'retype' } | null {
    const H = this.hist, n = H.length, line = this.line;
    const K = (i: number) => {
      const c = line[i];
      return c == null ? null : c === ' ' ? 'space' : c.toLowerCase();
    };
    // skipped 1-2 letters: two misses in a row that each match the letter(s) ahead
    if (n >= 2) {
      const e1 = H[n - 2], e2 = H[n - 1];
      if (!e1.keyOk && !e2.keyOk && e2.pos === e1.pos + 1) {
        for (const d of [1, 2]) {
          if (K(e1.pos + d) === e1.hit && K(e2.pos + d) === e2.hit) {
            this.restore(e1.snap);
            for (let i = 0; i < d; i++) this.state[e1.pos + i] = 'skip';
            this.ci = e1.pos + d;
            this.replay([e1, e2]);
            return { type: 'skip', chars: line.slice(e1.pos, e1.pos + d) };
          }
        }
      }
    }
    // an extra tap: three misses where the last two each match the letter behind them
    if (n >= 3) {
      const e0 = H[n - 3], e1 = H[n - 2], e2 = H[n - 1];
      if (!e0.keyOk && !e1.keyOk && !e2.keyOk && e1.pos === e0.pos + 1 && e2.pos === e1.pos + 1 && K(e0.pos) === e1.hit && K(e1.pos) === e2.hit) {
        if (e0.pos > 0 && e0.hit === K(e0.pos - 1)) {
          this.restore(e0.snap); // double tap: drop the extra tap
          this.replay([e1, e2]);
          return { type: 'double' };
        }
        this.restore(e1.snap); // missed, then retyped without deleting: keep the first miss
        this.ci = e0.pos;
        this.replay([e1, e2]);
        return { type: 'retype' };
      }
    }
    return null;
  }
  flashHint(h: Hint) {
    this.hint = h;
    clearTimeout(this.hintT);
    this.hintT = window.setTimeout(() => {
      this.hint = null;
      this.changed();
    }, 2600);
    this.changed();
  }

  onKey = (hit: string, down: Point) => {
    if (this.done) return;
    const line = this.line, ch = line[this.ci];
    const now = performance.now();
    if (!this.t0) this.t0 = now;
    const dt = this.tLast ? Math.round(now - this.tLast) : 0;
    this.tLast = now;
    const prev = this.ci > 0 ? (line[this.ci - 1] === ' ' ? '_' : line[this.ci - 1].toLowerCase()) : '';
    const exp = this.expectedKey();
    if (hit === 'shift') {
      this.hist = [];
      const dbl = now - this.lastShiftT < 350;
      this.lastShiftT = now;
      if (exp === 'shift') {
        this.grade(true, this.record('shift', 'shift', down, dt, prev));
        this.shift = 'on';
        sound('mod');
      } else if (this.shift === 'off') {
        // stray Shift while aiming at a letter
        this.grade(false, this.record(exp, 'shift', down, dt, prev));
        this.shift = 'on';
        sound('miss');
        this.shakeAt(this.ci);
      } else if (this.shift === 'on' && dbl) {
        this.shift = 'caps'; // double tap: caps lock
        sound('mod');
      } else {
        this.shift = 'off'; // turning it back off
        sound('mod');
      }
      buzz();
      return this.changed();
    }
    if (hit === 'del') {
      this.hist = [];
      const ps = this.ci > 0 ? this.state[this.ci - 1] : null;
      if (ps === 'ok' || ps === 'fixed' || ps == null) {
        // deleting a correct letter means Delete was a miss
        this.grade(false, this.record(exp === 'shift' ? ch.toLowerCase() : exp, 'del', down, dt, prev));
        sound('miss');
      } else sound('mod'); // fixing a typo is fine
      if (this.ci > 0) {
        this.ci--;
        this.state.length = this.ci;
      }
      if (this.shift !== 'caps') this.shift = this.ci === 0 ? 'on' : 'off';
      buzz();
      return this.changed();
    }
    // any other key types (or tries to type) the current character, then the cursor moves on
    const ev = this.typeKey(hit, down, dt);
    this.hist.push(ev);
    if (this.hist.length > 4) this.hist.shift();
    const re = !ev.keyOk ? this.tryRealign() : null;
    if (re) {
      this.realigns++;
      sound('key');
      const msg = re.type === 'skip' ? `Skipped “${re.chars.replace(/ /g, 'space')}”. Realigned and not counted.` : re.type === 'double' ? 'Extra tap ignored. Realigned.' : 'Retyped letter caught. Only the first miss counts.';
      this.flashHint({ tone: 'ok', label: 'Back in step', text: msg });
    } else if (ev.ok) sound(ch === ' ' ? 'mod' : 'key');
    else {
      sound('miss');
      this.shakeAt(ev.pos);
    }
    buzz();
    if (this.ci >= line.length) {
      this.li++;
      this.ci = 0;
      this.hist = [];
      this.state = [];
      if (this.shift !== 'caps') this.shift = 'on';
      if (this.li >= this.lines.length) {
        this.li = this.lines.length - 1;
        this.ci = this.line.length;
        this.changed();
        return this.finish();
      }
    }
    this.changed();
  };

  /** Ends early. Keeps the taps as a partial round when there are enough of them. */
  abort() {
    const S = store.S;
    clearTimeout(this.hintT);
    if (!this.done && this.taps.length >= 15) {
      commitTaps(this.taps);
      S.sessions.push({ id: this.sid, ts: Date.now(), mode: this.mode, focus: '', n: this.scored, hits: this.good, acc: this.good / Math.max(1, this.scored), partial: true });
      save();
    }
    this.done = true;
  }

  private finish() {
    const S = store.S;
    this.done = true;
    clearTimeout(this.hintT);
    const n = this.scored, acc = this.good / n, prec = this.precN ? this.precSum / this.precN : 0;
    const dur = Math.max(1, (this.tLast - this.t0) / 1000), chars = this.lines.reduce((a, l) => a + l.length, 0), wpm = chars / 5 / (dur / 60);
    const sess: Session = { id: this.sid, ts: Date.now(), mode: this.mode, focus: this.focus.map(focusCode).join(''), n, hits: this.good, acc, prec, wpm: Math.round(wpm * 10) / 10, combo: this.maxCombo, bull: this.maxBull, dur: Math.round(dur), caseSlips: this.caseSlips, realigns: this.realigns };
    const prevBest = S.bests.wpm, prevRounds = realSessions().length;
    commitTaps(this.taps);
    S.sessions.push(sess);
    const d = today();
    if (S.streak.last !== d) {
      const diff = S.streak.last ? dayDiff(S.streak.last, d) : 99;
      S.streak.count = diff === 1 ? S.streak.count + 1 : 1;
      S.streak.last = d;
      S.streak.best = Math.max(S.streak.best, S.streak.count);
    }
    const pbW = prevRounds >= 2 && wpm > prevBest && acc >= 0.9;
    S.bests.wpm = Math.max(S.bests.wpm, wpm);
    S.bests.combo = Math.max(S.bests.combo, this.maxCombo);
    save();
    const result: RoundResult = { sess, taps: this.taps.map(toObj), pbW, caseSlips: this.caseSlips, realigns: this.realigns, maxBull: this.maxBull };
    setTimeout(() => this.onFinish(result), 350);
  }
}

/** Rebuilds a finished round's results from what was saved, to reopen its summary later. */
export function pastResult(sess: Session): RoundResult {
  return { sess, taps: allTaps().filter((t) => t.sid === sess.id), pbW: false, caseSlips: sess.caseSlips || 0, realigns: sess.realigns || 0, maxBull: sess.bull || 0 };
}
