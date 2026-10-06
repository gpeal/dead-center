import { ALL, statsFor, troubleKeys, zoneStats } from './analysis';
import { buzz, sound } from './feedback';
import { KEY, LETTERS, edist, focusCode, isOutlier } from './keys';
import type { Point } from './keyboard';
import type { RoundResult } from './round';
import { allTaps, commitTaps, save, store, toObj, type Session, type Tap, type TapRow } from './store';

/** Taps of each letter in a set, and letters per drill. */
export const REPS = 10, SETS = 3;

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

export type DrillPhase = 'space' | 'letter' | 'review';

/**
 * A drill: for each letter, REPS reps of Space then the letter, so every letter tap starts from the same thumb
 * position. After a letter's reps it shows where they landed; Space moves on to the next letter.
 * Mutable like Round: the screen re-renders from it via subscribe().
 */
export class Drill {
  readonly mode = 'drill' as const;
  ki = 0; rep = 0; phase: DrillPhase = 'space';
  taps: TapRow[] = []; sid = Date.now(); t0 = 0; tLast = 0; done = false;
  hits = 0; precSum = 0; combo = 0; maxCombo = 0;
  /** the last letter tap, for the hit or miss flash */
  last: { ok: boolean; n: number } | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(public keys: string[], private onFinish: (r: RoundResult) => void) {}
  subscribe = (l: () => void) => (this.listeners.add(l), () => this.listeners.delete(l));
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  get key() { return this.keys[this.ki]; }
  /** This letter's taps so far in the drill, for its review. */
  setTaps(k = this.key) { return this.taps.filter((t) => t[1] === k).map(toObj); }

  private record(k: string, hit: string, down: Point, prev: string, now: number) {
    const key = KEY[k], dx = down.x - key.cx, dy = down.y - key.cy, dt = this.tLast ? now - this.tLast : 0;
    if (!isOutlier(k, dx, dy)) this.taps.push([this.sid, k, hit, Math.round(dx * 10), Math.round(dy * 10), prev, Math.min(dt, 9999)]);
    return { dx, dy, key };
  }

  onKey = (hit: string, down: Point) => {
    if (this.done) return;
    const now = performance.now();
    if (!this.t0) this.t0 = now;
    if (this.phase === 'space' || this.phase === 'review') {
      // only Space moves things along; anything else is ignored, so it isn't counted as aim at a letter
      if (hit !== 'space') return;
      this.record('space', 'space', down, this.rep ? this.key : '', now);
      sound('key');
      buzz();
      if (this.phase === 'review') {
        if (this.ki === this.keys.length - 1) return this.finish(); // the last letter stays on screen until results
        this.ki++;
        this.rep = 0;
      }
      this.phase = 'letter';
    } else {
      const ok = hit === this.key, r = this.record(this.key, hit, down, '_', now);
      if (ok) {
        this.hits++;
        this.precSum += 1 - Math.min(1, edist(r.dx, r.dy, r.key));
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
      } else this.combo = 0;
      sound(ok ? 'key' : 'miss');
      buzz();
      this.last = { ok, n: (this.last?.n || 0) + 1 };
      this.rep++;
      this.phase = this.rep >= REPS ? 'review' : 'space';
    }
    this.tLast = now;
    this.changed();
  };

  /** Ends early. Keeps the taps as a partial drill when there are enough of them. */
  abort() {
    if (!this.done && this.taps.length >= 15) {
      commitTaps(this.taps);
      const n = this.ki * REPS + this.rep;
      store.S.sessions.push({ id: this.sid, ts: Date.now(), mode: 'drill', focus: this.keys.map(focusCode).join(''), n, hits: this.hits, acc: this.hits / Math.max(1, n), partial: true });
      save();
    }
    this.done = true;
  }

  private finish() {
    this.done = true;
    const n = this.keys.length * REPS, acc = this.hits / n;
    const sess: Session = {
      id: this.sid, ts: Date.now(), mode: 'drill', focus: this.keys.map(focusCode).join(''), n, hits: this.hits, acc,
      prec: this.hits ? this.precSum / this.hits : 0, combo: this.maxCombo, dur: Math.round(Math.max(1, (this.tLast - this.t0) / 1000)),
    };
    commitTaps(this.taps);
    store.S.sessions.push(sess);
    save();
    this.changed();
    const result: RoundResult = { sess, taps: this.taps.map(toObj), pbW: false, caseSlips: 0, realigns: 0, maxBull: 0 };
    setTimeout(() => this.onFinish(result), 250);
  }
}
