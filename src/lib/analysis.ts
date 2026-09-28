import { KEY, TRAINABLE, LEFT, RIGHT, HANDOFF, EDGE, edist, lab } from './keys';
import { median, pct, fmt1 } from './util';
import type { Tap, Session } from './store';

export interface KeyStats {
  k: string; n: number; hits: number; acc: number; prec: number; mastery: number;
  mx: number; my: number; sdx: number; sdy: number; conf: Record<string, number>; dtH: number[]; dtM: number[]; arr: Tap[];
}
export function statsFor(taps: Tap[], k: string, win = 100): KeyStats {
  const arr: Tap[] = [];
  for (let i = taps.length - 1; i >= 0 && arr.length < win; i--) if (taps[i].k === k) arr.push(taps[i]);
  arr.reverse();
  const n = arr.length, key = KEY[k];
  if (!n) return { k, n: 0, hits: 0, acc: 0, prec: 0, mastery: 0, mx: 0, my: 0, sdx: 0, sdy: 0, conf: {}, dtH: [], dtM: [], arr };
  let hits = 0, sx = 0, sy = 0, sxx = 0, syy = 0, ps = 0;
  const conf: Record<string, number> = {}, dtH: number[] = [], dtM: number[] = [];
  for (const t of arr) {
    sx += t.dx; sy += t.dy; sxx += t.dx * t.dx; syy += t.dy * t.dy;
    if (t.h === k) {
      hits++;
      ps += 1 - Math.min(1, edist(t.dx, t.dy, key));
      if (t.dt > 0 && t.dt < 2500) dtH.push(t.dt);
    } else {
      conf[t.h] = (conf[t.h] || 0) + 1;
      if (t.dt > 0 && t.dt < 2500) dtM.push(t.dt);
    }
  }
  const mx = sx / n, my = sy / n, sdx = Math.sqrt(Math.max(0, sxx / n - mx * mx)), sdy = Math.sqrt(Math.max(0, syy / n - my * my));
  const acc = hits / n, prec = hits ? ps / hits : 0;
  return { k, n, hits, acc, prec, mx, my, sdx, sdy, conf, dtH, dtM, arr, mastery: Math.round(100 * (0.78 * acc + 0.22 * prec)) };
}
export type Tone = 'good' | 'ok' | 'warn' | 'bad';
export const masteryLabel = (m: number): [string, Tone] => (m >= 92 ? ['Mastered', 'good'] : m >= 84 ? ['Solid', 'ok'] : m >= 72 ? ['Shaky', 'warn'] : ['Needs work', 'bad']);
export const toneColor = (t: string) => ({ good: 'var(--green)', ok: 'var(--accent)', warn: 'var(--gold)', bad: 'var(--red)' } as Record<string, string>)[t] || 'var(--muted)';
export function sessionSeries(taps: Tap[], k: string) {
  const by = new Map<number, { n: number; h: number }>();
  for (const t of taps) if (t.k === k) {
    let o = by.get(t.sid);
    if (!o) by.set(t.sid, (o = { n: 0, h: 0 }));
    o.n++;
    if (t.h === k) o.h++;
  }
  return [...by.entries()].filter(([, o]) => o.n >= 3).sort((a, b) => a[0] - b[0]).map(([sid, o]) => ({ sid, acc: o.h / o.n }));
}
export function keyTrend(taps: Tap[], k: string) {
  const arr = taps.filter((t) => t.k === k);
  if (arr.length < 20) return null;
  const m = Math.min(50, Math.floor(arr.length / 2));
  const a = arr.slice(-2 * m, -m), b = arr.slice(-m);
  const acc = (x: Tap[]) => x.filter((t) => t.h === k).length / x.length;
  return acc(b) - acc(a);
}
export function drillImpact(taps: Tap[], sessions: Session[], k: string) {
  const first = sessions.find((s) => s.mode === 'drill' && (s.focus || '').includes(k === 'space' ? '_' : k === 'shift' ? '^' : k));
  if (!first) return null;
  const before = taps.filter((t) => t.k === k && t.sid < first.id).slice(-50), after = taps.filter((t) => t.k === k && t.sid >= first.id).slice(-50);
  if (before.length < 8 || after.length < 8) return null;
  const acc = (x: Tap[]) => x.filter((t) => t.h === k).length / x.length;
  return { before: acc(before), after: acc(after), nb: before.length, na: after.length };
}
export function dirWords(dx: number, dy: number) {
  const p: string[] = [];
  if (Math.abs(dy) >= 0.8) p.push(`${fmt1(Math.abs(dy))} pt ${dy > 0 ? 'low' : 'high'}`);
  if (Math.abs(dx) >= 0.8) p.push(`${fmt1(Math.abs(dx))} pt ${dx > 0 ? 'right' : 'left'}`);
  return p.length ? p.join(', ') : 'right on center';
}
export interface Diagnosis { headline: string; short: string; why: string[]; fixes: string[]; tone: string }
export function diagnose(s: KeyStats): Diagnosis {
  const k = s.k, key = KEY[k], L = lab(k);
  if (!s.n || s.n < 6) return { headline: `Not enough ${L} taps yet`, short: 'Needs more data', why: [`${L} needs about 6 taps for a reliable pattern.`], fixes: [], tone: 'flat' };
  const hw = key.w / 2, hh = key.h / 2, bx = s.mx / hw, by = s.my / hh, se = (v: number) => v / Math.sqrt(s.n);
  const sigX = Math.abs(bx) > 0.16 && Math.abs(s.mx) > 2 * se(s.sdx) && Math.abs(s.mx) >= 1, sigY = Math.abs(by) > 0.16 && Math.abs(s.my) > 2 * se(s.sdy) && Math.abs(s.my) >= 1;
  const misses = s.n - s.hits, confs = Object.entries(s.conf).sort((a, b) => b[1] - a[1]), top = confs[0];
  const why: string[] = [], fixes: string[] = [];
  let headline: string, short: string;
  const inward = (LEFT.has(k) && s.mx > 0) || (RIGHT.has(k) && s.mx < 0);
  // transitions: which previous character precedes misses
  const pm: Record<string, { n: number; m: number }> = {};
  for (const t of s.arr) {
    if (!t.p) continue;
    const o = pm[t.p] || (pm[t.p] = { n: 0, m: 0 });
    o.n++;
    if (t.h !== k) o.m++;
  }
  const trans = Object.entries(pm).filter(([, o]) => o.m >= 2 && o.m / o.n >= Math.max(0.3, 2 * (1 - s.acc))).sort((a, b) => b[1].m - a[1].m)[0];
  const rushing = s.dtM.length >= 2 && s.dtH.length >= 4 && median(s.dtM) < 0.8 * median(s.dtH);
  const spread = Math.max(s.sdx / hw, s.sdy / hh);

  if (misses >= 2 && top && top[1] >= Math.max(2, 0.4 * misses)) { headline = `${L} slips onto ${lab(top[0])}`; short = `${top[1]} of ${misses} misses land on ${lab(top[0])}`; }
  else if (sigX || sigY) { headline = `${L} lands ${dirWords(s.mx, s.my)}`; short = `Average tap ${dirWords(s.mx, s.my)}`; }
  else if (spread > 0.42) { headline = `${L} is centered but scattered`; short = `Spread of ±${fmt1(Math.max(s.sdx, s.sdy))} pt`; }
  else if (s.acc >= 0.95) { headline = `${L} is on target`; short = `${pct(s.acc)}% clean, ${pct(s.prec)}% centered`; }
  else { headline = `${L} misses now and then`; short = `${misses} misses in ${s.n} taps`; }

  if (k === 'space') {
    if (s.my < -1.5 || confs.some(([h]) => 'cvbnm'.includes(h))) { why.push(`You catch the bottom letter row, ${fmt1(Math.abs(s.my))} pt above the bar's center.`); fixes.push('Aim for the lower half of the space bar with a short, low tap.'); }
    else why.push('Space is big, so misses usually come from rushing the end of a word.');
    fixes.push('Finish each word, then tap space lightly.');
  } else {
    if (sigY && s.my > 0) { why.push(`Your ${L} taps land ${fmt1(s.my)} pt below center: your thumb pad meets the glass lower than where you look${key.row === 0 ? ', worst on the stretched top row' : ''}.`); fixes.push(`Aim at the top edge of ${L}, not its middle.`); }
    if (sigY && s.my < 0) { why.push(`Your ${L} taps land ${fmt1(-s.my)} pt above center${key.row > 0 ? ', into the row above' : ''}, a sign of a low grip.`); fixes.push(`Aim at the lower half of ${L}.`); fixes.push('Hold the phone a little higher so your thumbs rest near the space bar.'); }
    if (sigX && EDGE.has(k) && inward) { why.push(`You stop ${fmt1(Math.abs(s.mx))} pt short of ${L}. Edge keys are the longest reach, so taps fall inward.`); fixes.push(`Aim past the letter, toward the outer edge of ${L}.`); fixes.push('Flatten your thumb on edge keys so the pad makes contact.'); }
    else if (sigX && inward) { why.push(`Your ${L} taps drift ${fmt1(Math.abs(s.mx))} pt toward the middle, where your thumb comes from.`); fixes.push(`Aim a hair toward the outside of ${L}.`); }
    else if (sigX) { why.push(`Your ${L} taps drift ${fmt1(Math.abs(s.mx))} pt ${s.mx > 0 ? 'right' : 'left'}: your thumb comes in at an angle.`); fixes.push(`Aim slightly toward the keyboard's center on ${L}.`); fixes.push('Bring your thumb in from below rather than from the side.'); }
    if (HANDOFF.has(k) && top && ((LEFT.has(k) && RIGHT.has(top[0])) || (RIGHT.has(k) && LEFT.has(top[0])))) { why.push(`${L} sits between your thumbs, so misses often come from switching thumbs mid-word.`); fixes.push('Give each middle key one thumb: T, G, V, B left; Y, H, N right.'); }
  }
  if (!sigX && !sigY && spread > 0.42) { why.push(`Your average is near center, but taps spread ±${fmt1(Math.max(s.sdx, s.sdy))} pt. It's consistency, not aim.`); fixes.push(`Drill ${L} at about 80% of your usual speed.`); fixes.push('Keep your thumbs hovering close to the glass.'); }
  if (rushing) { why.push(`Misses came ${Math.round(median(s.dtM))} ms after the previous tap vs ${Math.round(median(s.dtH))} ms on hits. You're rushing ${L}.`); fixes.push(`Take a half beat before ${L}.`); }
  if (trans) { const p = trans[0], pl = p === '_' ? 'space' : lab(p); why.push(`Most misses come right after ${pl} (${trans[1].m} of ${trans[1].n} times).`); fixes.push(`Practice the ${pl} to ${L} jump on its own.`); }
  if (!why.length) why.push(s.acc >= 0.95 ? `${pct(s.acc)}% clean, ${pct(s.prec)}% centered. Nothing to fix.` : 'No clear pattern yet. This usually settles after a few rounds.');
  if (!fixes.length) fixes.push(`Keep ${L} in rotation.`);
  if (EDGE.has(k) && (sigX || s.acc < 0.9)) fixes.push('Typing one-handed? Hold the emoji key and pick a one-handed layout.');
  return { headline, short, why, fixes: [...new Set(fixes)].slice(0, 3), tone: s.acc >= 0.95 ? 'good' : s.acc >= 0.88 ? 'warn' : 'bad' };
}
export function troubleKeys(taps: Tap[], max = 3) {
  const out: { k: string; s: KeyStats; pri: number }[] = [];
  for (const k of TRAINABLE) {
    const s = statsFor(taps, k, 80);
    if (s.n >= 8 && (s.acc < 0.97 || s.mastery < 86)) out.push({ k, s, pri: (1 - s.acc) * 2 + (1 - s.prec) * 0.5 + Math.min(s.n, 60) / 600 });
  }
  return out.sort((a, b) => b.pri - a.pri).slice(0, max);
}
export type RowAcc = { n: number; acc: number } | null;
export type Pattern = { t: string; v: string; p: string } | { rows: [string, RowAcc][] };
export function patterns(taps: Tap[]): Pattern[] {
  const L = taps.slice(-3000), out: Pattern[] = [];
  if (L.length < 30) return out;
  const letters = L.filter((t) => KEY[t.k].type === 'letter');
  const my = letters.reduce((a, t) => a + t.dy, 0) / letters.length;
  if (Math.abs(my) >= 1) out.push({ t: my > 0 ? 'You land low overall' : 'You land high overall', v: `${fmt1(Math.abs(my))} pt`, p: my > 0 ? 'The most common thumb pattern. Aim at the top of each letter.' : 'Usually a low grip. Hold the phone a little higher.' });
  else out.push({ t: 'Vertical aim is centered', v: `${fmt1(Math.abs(my))} pt`, p: 'Misses come from left-right drift or spread instead.' });
  const rowAcc = (r: number): RowAcc => {
    const a = L.filter((t) => KEY[t.k].row === r);
    return a.length ? { n: a.length, acc: a.filter((t) => t.h === t.k).length / a.length } : null;
  };
  out.push({ rows: [['Top', rowAcc(0)], ['Home', rowAcc(1)], ['Bottom', rowAcc(2)], ['Space', rowAcc(3)]] });
  const e = letters.filter((t) => EDGE.has(t.k)), m = letters.filter((t) => !EDGE.has(t.k));
  if (e.length >= 15 && m.length >= 15) {
    const ea = e.filter((t) => t.h === t.k).length / e.length, ma = m.filter((t) => t.h === t.k).length / m.length;
    if (ma - ea > 0.03) out.push({ t: 'Edge keys cost you', v: `${pct(ea)}% vs ${pct(ma)}%`, p: 'Q, A, Z, P and L trail the rest. Aim past the letter on those.' });
    else out.push({ t: 'Edge keys hold up', v: `${pct(ea)}% vs ${pct(ma)}%`, p: 'Q, A, Z, P and L keep pace with the middle. Reach is fine.' });
  }
  const lh = letters.filter((t) => LEFT.has(t.k)), rh = letters.filter((t) => RIGHT.has(t.k));
  if (lh.length >= 20 && rh.length >= 20) {
    const la = lh.filter((t) => t.h === t.k).length / lh.length, ra = rh.filter((t) => t.h === t.k).length / rh.length;
    out.push({ t: Math.abs(la - ra) < 0.02 ? 'Both thumbs are even' : la < ra ? 'Left thumb misses more' : 'Right thumb misses more', v: `L ${pct(la)}% · R ${pct(ra)}%`, p: Math.abs(la - ra) < 0.02 ? 'Both halves are within two points.' : `Check your grip on the ${la < ra ? 'left' : 'right'} side.` });
  }
  const dh = L.filter((t) => t.h === t.k && t.dt > 0 && t.dt < 2500).map((t) => t.dt), dm = L.filter((t) => t.h !== t.k && t.dt > 0 && t.dt < 2500).map((t) => t.dt);
  if (dm.length >= 4 && dh.length >= 20) {
    const a = median(dm), b = median(dh);
    out.push({ t: a < 0.85 * b ? 'Misses come when you rush' : 'Speed is not the problem', v: `${Math.round(a)} / ${Math.round(b)} ms`, p: a < 0.85 * b ? 'Misses come faster than your usual rhythm. Slow down slightly.' : 'Misses come at your normal rhythm, so work on aim.' });
  }
  return out;
}
