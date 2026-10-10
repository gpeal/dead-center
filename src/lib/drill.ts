import { ALL, statsFor, troubleKeys, zoneStats } from './analysis';
import { buzz, sound } from './feedback';
import { KEY, LETTERS, edist, focusCode, isOutlier } from './keys';
import type { Point } from './keyboard';
import type { RoundResult } from './round';
import { WORDS } from './text';
import { allTaps, commitTaps, save, store, toObj, type Session, type Tap, type TapRow } from './store';

/**
 * A letter is done once GOAL of the last WINDOW taps on it land inside the gold zone (GOLD of the way from the center
 * to the key's edge), or after MAX taps. On real data a 75% zone with 4 of 5 takes about ten taps; a tighter zone or
 * a straight run of five takes hundreds.
 */
export const SETS = 3, GOLD = 0.75, GOAL = 4, WINDOW = 5, MAX = 15;

/**
 * The letters a drill works on: the trouble keys first, then the keys of the weakest zone (by accuracy, then by how
 * far its keys drift), then the least accurate letters overall, so a drill always has SETS letters.
 */
export function drillKeys(taps: Tap[] = allTaps()): string[] {
  const out = troubleKeys(taps, SETS).map((t) => t.k).filter((k) => k !== 'space' && k !== 'shift');
  const add = (ks: string[]) => ks.forEach((k) => out.length < SETS && !out.includes(k) && out.push(k));
  const zone = zoneStats(taps, ALL).filter((z) => z.n >= 8).sort((a, b) => a.acc - b.acc)[0];
  if (zone) {
    const drift = (k: string) => { const s = statsFor(taps, k, ALL); return s.n ? (1 - s.acc) * 40 + Math.hypot(s.mx, s.my) : -1; };
    add([...zone.zone.keys].sort((a, b) => drift(b) - drift(a)));
  }
  add(LETTERS.map((k) => ({ k, s: statsFor(taps, k, ALL) })).filter((x) => x.s.n >= 5).sort((a, b) => a.s.acc - b.s.acc).map((x) => x.k));
  add(['e', 't', 'a']);
  return out;
}

/** The key you most often miss `k` right after (Space when there's no clear one): the transition worth training. */
export function leadIn(k: string, taps: Tap[] = allTaps()): string {
  const n: Record<string, number> = {};
  for (const t of taps) if (t.k === k && t.h !== k && t.p && t.p !== k) n[t.p] = (n[t.p] || 0) + 1;
  const [p, c] = Object.entries(n).sort((a, b) => b[1] - a[1])[0] || ['_', 0];
  return c >= 2 && (p === '_' || KEY[p]) ? (p === '_' ? 'space' : p) : 'space';
}
/** Short words with the lead-in straight into the letter, mixed in so the motion shows up inside real typing. */
function wordsFor(lead: string, k: string) {
  const pair = (lead === 'space' ? ' ' : lead) + k;
  return WORDS.filter((w) => w.length <= 5 && /^[a-z]+$/.test(w) && (lead === 'space' ? w.startsWith(k) : w.includes(pair)));
}

/** `in`: inside the gold zone; `hit`: on the key but outside it; `miss`: another key. */
export type Mark = 'in' | 'hit' | 'miss';

/**
 * A drill. Each letter is typed after the key you usually miss it from (the lead-in), sometimes inside a short word,
 * until the goal is met. Mutable like Round: the screen re-renders from it via subscribe().
 */
export class Drill {
  readonly mode = 'drill' as const;
  ki = 0; seq: string[] = []; si = 0; reps = 0;
  /** the rep after this one, shown faintly so a switch to a word is visible before you reach it */
  upcoming: string[] = [];
  /** bumps when a wrong key on an ungraded letter is ignored, so the screen can shake it */
  shake = 0; slipped = false;
  private undo: { seq: string[]; si: number; reps: number; upcoming: string[]; pushed: boolean; mark?: Mark; ok?: boolean; prec?: number }[] = [];
  taps: TapRow[] = []; sid = Date.now(); t0 = 0; tLast = 0; done = false;
  /** this letter's taps, newest last, and whether the letter is finished (shown briefly before the next) */
  marks: Mark[] = []; cleared = false;
  hits = 0; n = 0; precSum = 0;
  leads: string[];
  private words: string[][];
  private timer = 0;
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(public keys: string[], private onFinish: (r: RoundResult) => void) {
    const taps = allTaps();
    this.leads = keys.map((k) => leadIn(k, taps));
    this.words = keys.map((k, i) => wordsFor(this.leads[i], k));
    this.upcoming = this.makeSeq(0);
    this.nextSeq();
  }
  subscribe = (l: () => void) => (this.listeners.add(l), () => this.listeners.delete(l));
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  get key() { return this.keys[this.ki]; }
  get lead() { return this.leads[this.ki]; }
  /** the key due next */
  get next() { return this.seq[this.si]; }
  /** this letter's taps so far, to draw on the keyboard */
  setTaps(k = this.key) { return this.taps.filter((t) => t[1] === k).map(toObj); }
  /** how many of the last WINDOW taps are inside the gold zone */
  get inWindow() { return this.marks.slice(-WINDOW).filter((m) => m === 'in').length; }

  // every third rep is a short word with the transition in it, when there is one
  private makeSeq(rep: number) {
    const ws = this.words[this.ki];
    // picked from the rep number (and this drill), so taking a tap back never changes the word you were shown
    const w = rep % 3 === 2 && ws.length ? ws[(Math.floor(rep / 3) * 7 + (this.sid % 97)) % ws.length] : null;
    return w ? w.split('') : [this.lead, this.key];
  }
  private nextSeq() {
    this.seq = this.upcoming;
    this.si = 0;
    this.reps++;
    this.upcoming = this.makeSeq(this.reps);
  }

  private record(k: string, hit: string, down: Point, now: number) {
    const key = KEY[k], dx = down.x - key.cx, dy = down.y - key.cy, dt = this.tLast ? now - this.tLast : 0;
    const prev = this.si ? (this.seq[this.si - 1] === 'space' ? '_' : this.seq[this.si - 1]) : '';
    if (!isOutlier(k, dx, dy)) this.taps.push([this.sid, k, hit, Math.round(dx * 10), Math.round(dy * 10), prev, Math.min(dt, 9999)]);
    return { dx, dy, key };
  }

  onKey = (hit: string, down: Point) => {
    if (this.done || this.cleared) return;
    if (hit === 'del') return this.back();
    const now = performance.now();
    if (!this.t0) this.t0 = now;
    const exp = this.next;
    // only the drilled letter is graded; anywhere else a wrong key is a slip, so it waits for the right one
    if (exp !== this.key && hit !== exp) {
      this.shake++;
      this.slipped = true;
      sound('miss');
      return this.changed();
    }
    this.slipped = false;
    const before = this.taps.length, snap = { seq: this.seq, si: this.si, reps: this.reps, upcoming: this.upcoming };
    const r = this.record(exp, hit, down, now);
    const entry: (typeof this.undo)[number] = { ...snap, pushed: this.taps.length > before };
    this.undo.push(entry);
    this.tLast = now;
    if (exp === this.key) {
      const ok = hit === exp, e = edist(r.dx, r.dy, r.key);
      this.n++;
      const prec = ok ? 1 - Math.min(1, e) : 0;
      if (ok) {
        this.hits++;
        this.precSum += prec;
      }
      const m: Mark = ok && e <= GOLD ? 'in' : ok ? 'hit' : 'miss';
      this.marks.push(m);
      Object.assign(entry, { mark: m, ok, prec });
      sound(m === 'miss' ? 'miss' : 'key');
      if (this.inWindow >= GOAL || this.marks.length >= MAX) {
        this.cleared = true;
        sound('chime');
        this.undo = [];
        this.timer = window.setTimeout(() => this.advance(), 1400);
      }
    } else sound(hit === exp ? 'key' : 'miss');
    buzz();
    this.si++;
    if (this.si >= this.seq.length && !this.cleared) this.nextSeq();
    this.changed();
  };

  /** Delete: takes back the last tap on this letter completely (its dot, its streak mark and its stats). */
  private back() {
    const u = this.undo.pop();
    this.slipped = false;
    if (!u) return;
    if (u.pushed) this.taps.pop();
    if (u.mark) {
      this.marks.pop();
      this.n--;
      if (u.ok) {
        this.hits--;
        this.precSum -= u.prec || 0;
      }
    }
    Object.assign(this, { seq: u.seq, si: u.si, reps: u.reps, upcoming: u.upcoming });
    sound('mod');
    this.changed();
  }

  private advance() {
    if (this.ki >= this.keys.length - 1) return this.finish();
    this.ki++;
    this.marks = [];
    this.undo = [];
    this.cleared = false;
    this.reps = 0;
    this.upcoming = this.makeSeq(0);
    this.nextSeq();
    this.changed();
  }
  /** the next letter and its lead-in, shown while a finished letter is on screen */
  get after() { return this.ki < this.keys.length - 1 ? { key: this.keys[this.ki + 1], lead: this.leads[this.ki + 1] } : null; }

  /** Ends early. Keeps the taps as a partial drill when there are enough of them. */
  abort() {
    clearTimeout(this.timer);
    if (!this.done && this.taps.length >= 15) {
      commitTaps(this.taps);
      store.S.sessions.push({ id: this.sid, ts: Date.now(), mode: 'drill', focus: this.keys.map(focusCode).join(''), n: this.n, hits: this.hits, acc: this.hits / Math.max(1, this.n), partial: true });
      save();
    }
    this.done = true;
  }

  private finish() {
    this.done = true;
    const sess: Session = {
      id: this.sid, ts: Date.now(), mode: 'drill', focus: this.keys.map(focusCode).join(''), n: this.n, hits: this.hits, acc: this.hits / Math.max(1, this.n),
      prec: this.hits ? this.precSum / this.hits : 0, dur: Math.round(Math.max(1, (this.tLast - this.t0) / 1000)),
    };
    commitTaps(this.taps);
    store.S.sessions.push(sess);
    save();
    const result: RoundResult = { sess, taps: this.taps.map(toObj), pbW: false, caseSlips: 0, realigns: 0, maxBull: 0 };
    this.onFinish(result);
  }
}
