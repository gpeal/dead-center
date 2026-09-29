import { KEY, hitTest, edist } from './keys';
import { SENTENCES } from './text';
import { rng, gauss } from './util';
import type { Dataset, Session, Tap } from './store';

/* Sample data, shown until you have your own. */
export function makeSample(): Dataset {
  const r = rng(11), taps: Tap[] = [], sessions: Session[] = [];
  const start = Date.now() - 13 * 864e5;
  const bias = (k: string): [number, number] => {
    const key = KEY[k];
    let bx = 0, by = 2.4;
    if (key.row === 0) by += 1.8;
    if ('qaz'.includes(k)) bx += 3.6;
    if ('pl'.includes(k)) bx -= 4.6;
    if (k === 'o') bx -= 2.8;
    if (k === 'b') bx += 2.4;
    if (k === 'n') bx -= 2.2;
    if (k === 'space') by = -5.2;
    return [bx, by];
  };
  for (let s = 0; s < 14; s++) {
    const sid = start + s * 864e5 + r() * 3e7, imp = 1 - s * 0.045;
    let n = 0, h = 0, ps = 0;
    const lines: string[] = [];
    for (let i = 0; i < 3; i++) lines.push(SENTENCES[Math.floor(r() * SENTENCES.length)]);
    for (const line of lines) {
      let prev = '';
      for (const ch of line) {
        const k = ch === ' ' ? 'space' : ch.toLowerCase(), key = KEY[k];
        const [bx, by] = bias(k), sd = 9 * imp + 3.5; // early rounds land around 85% and improve to about 99% over the two weeks
        for (let tries = 0; tries < 3; tries++) {
          const dx = bx * imp + gauss(r) * sd * (k === 'space' ? 3 : 1), dy = by * imp + gauss(r) * sd * 0.85;
          const hit = hitTest(key.cx + dx, key.cy + dy);
          taps.push({ sid, k, h: hit, dx, dy, p: prev, dt: Math.round(150 + r() * 170) });
          n++;
          if (hit === k) {
            h++;
            ps += 1 - Math.min(1, edist(dx, dy, key));
            break;
          }
        }
        prev = ch === ' ' ? '_' : ch.toLowerCase();
      }
    }
    sessions.push({ id: sid, ts: sid, mode: s === 0 ? 'baseline' : s % 3 === 2 ? 'drill' : 'round', focus: s % 3 === 2 ? 'pl' : '', n, hits: h, acc: h / n, prec: ps / h, wpm: 30 + s * 1.1 + r() * 3, combo: 0 });
  }
  return { taps, sessions, sample: true };
}
