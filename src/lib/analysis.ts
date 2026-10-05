import { KEY, TRAINABLE, LEFT, RIGHT, HANDOFF, EDGE, edist, lab } from './keys';
import { median, pct, fmt1 } from './util';
import { store, type Tap, type Session } from './store';

export interface KeyStats {
  /** n and hits are raw counts of the taps considered; acc, prec, drift and spread are recency weighted. */
  k: string; n: number; neff: number; hits: number; acc: number; prec: number; mastery: number;
  mx: number; my: number; sdx: number; sdy: number; conf: Record<string, number>; dtH: number[]; dtM: number[]; arr: Tap[];
}
/**
 * Recency weighting (an exponential moving average): each tap on a key counts half as much for every recentHalf()
 * later taps on that same key (set in Settings). Decaying per key rather than per round keeps rare letters like Q from
 * fading to nothing. recentHalf() is "how you type now"; slowHalf() is the long-run baseline that changes are measured
 * against, always at least five times longer; ALL is unweighted.
 */
export const ALL = Infinity;
export const recentHalf = () => store.S.settings.half || 30;
export const slowHalf = () => Math.max(150, recentHalf() * 5);
export function statsFor(taps: Tap[], k: string, half = recentHalf()): KeyStats {
  const horizon = half === ALL ? Infinity : Math.round(half * 4); // older taps weigh under 7% and are skipped
  const arr: Tap[] = [];
  for (let i = taps.length - 1; i >= 0 && arr.length < horizon; i--) if (taps[i].k === k) arr.push(taps[i]);
  arr.reverse();
  const n = arr.length, key = KEY[k];
  if (!n) return { k, n: 0, neff: 0, hits: 0, acc: 0, prec: 0, mastery: 0, mx: 0, my: 0, sdx: 0, sdy: 0, conf: {}, dtH: [], dtM: [], arr };
  let W = 0, W2 = 0, hits = 0, wHit = 0, sx = 0, sy = 0, sxx = 0, syy = 0, ps = 0;
  const conf: Record<string, number> = {}, dtH: number[] = [], dtM: number[] = [];
  arr.forEach((t, i) => {
    const w = half === ALL ? 1 : Math.pow(0.5, (n - 1 - i) / half);
    W += w; W2 += w * w;
    sx += w * t.dx; sy += w * t.dy; sxx += w * t.dx * t.dx; syy += w * t.dy * t.dy;
    if (t.h === k) {
      hits++;
      wHit += w;
      ps += w * (1 - Math.min(1, edist(t.dx, t.dy, key)));
      if (t.dt > 0 && t.dt < 2500) dtH.push(t.dt);
    } else {
      conf[t.h] = (conf[t.h] || 0) + 1;
      if (t.dt > 0 && t.dt < 2500) dtM.push(t.dt);
    }
  });
  const my = sy / W, sdy = Math.sqrt(Math.max(0, syy / W - my * my));
  // space has no sideways drift or spread to fix (see edist), so only its vertical aim counts
  const flat = k === 'space', mx = flat ? 0 : sx / W, sdx = flat ? 0 : Math.sqrt(Math.max(0, sxx / W - mx * mx));
  const acc = wHit / W, prec = wHit ? ps / wHit : 0;
  // effective sample size: how many equally weighted taps the weighted ones are worth
  const neff = (W * W) / W2;
  return { k, n, neff, hits, acc, prec, mx, my, sdx, sdy, conf, dtH, dtM, arr, mastery: Math.round(100 * (0.78 * acc + 0.22 * prec)) };
}
/** Each tap's recency weight (see statsFor), aligned with `taps`. */
export function recencyWeights(taps: Tap[], half = recentHalf()) {
  const w = new Float32Array(taps.length), seen: Record<string, number> = {};
  for (let i = taps.length - 1; i >= 0; i--) {
    const k = taps[i].k, age = seen[k] || 0;
    seen[k] = age + 1;
    w[i] = half === ALL ? 1 : Math.pow(0.5, age / half);
  }
  return w;
}
/* Thumb technique phrases shared by the key sheet, the Map patterns and the round tip. */
const HOVER = 'Hover your thumb just above the glass between letters so each tap is a short, straight drop.';
const SPACE_ALT = 'Tap space with the thumb that did not type the last letter: it is already free.';
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
/** Recent accuracy minus long-run accuracy for a key, or null until there are enough taps to compare. */
export function keyTrend(taps: Tap[], k: string) {
  const slow = statsFor(taps, k, slowHalf());
  if (slow.n < 20) return null;
  return statsFor(taps, k).acc - slow.acc;
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
  const hw = key.w / 2, hh = key.h / 2, bx = s.mx / hw, by = s.my / hh, se = (v: number) => v / Math.sqrt(s.neff);
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
    else why.push('Your space misses stay on the bar row, so they happen as a word ends, not from aiming high.');
    fixes.push(SPACE_ALT);
  } else {
    if (sigY && s.my > 0) { why.push(`Your ${L} taps land ${fmt1(s.my)} pt below center: your thumb pad meets the glass lower than where you look${key.row === 0 ? ', worst on the stretched top row' : ''}.`); fixes.push(`Aim at the top edge of ${L}, not its middle.`); }
    if (sigY && s.my < 0) { why.push(`Your ${L} taps land ${fmt1(-s.my)} pt above center${key.row > 0 ? ', into the row above' : ''}, a sign of a low grip.`); fixes.push(`Aim at the lower half of ${L}.`); fixes.push('Hold the phone a little higher so your thumbs rest near the space bar.'); }
    if (sigX && EDGE.has(k) && inward) { why.push(`You stop ${fmt1(Math.abs(s.mx))} pt short of ${L}. Edge keys are the longest reach, so taps fall inward.`); fixes.push(`Aim past the letter, toward the outer edge of ${L}.`); fixes.push('Flatten your thumb on edge keys so the pad makes contact.'); }
    else if (sigX && inward) { why.push(`Your ${L} taps drift ${fmt1(Math.abs(s.mx))} pt toward the middle, where your thumb comes from.`); fixes.push(`Aim a hair toward the outside of ${L}.`); }
    else if (sigX) { why.push(`Your ${L} taps drift ${fmt1(Math.abs(s.mx))} pt ${s.mx > 0 ? 'right' : 'left'}: your thumb comes in at an angle.`); fixes.push(`Aim slightly toward the keyboard's center on ${L}.`); fixes.push('Bring your thumb in from below rather than from the side.'); }
    if (HANDOFF.has(k) && top && ((LEFT.has(k) && RIGHT.has(top[0])) || (RIGHT.has(k) && LEFT.has(top[0])))) { why.push(`${L} sits between your thumbs, so misses often come from switching thumbs mid-word.`); fixes.push('Give each middle key one thumb: T, G, V, B left; Y, H, N right.'); }
  }
  if (!sigX && !sigY && spread > 0.42) { why.push(`Your average is near center, but taps spread ±${fmt1(Math.max(s.sdx, s.sdy))} pt. It's consistency, not aim.`); fixes.push(HOVER); }
  if (rushing) {
    why.push(`Misses came ${Math.round(median(s.dtM))} ms after the previous tap vs ${Math.round(median(s.dtH))} ms on hits. You're rushing ${L}.`);
    const fix = transitionFix(k, s.arr.filter((t) => t.h !== k));
    if (fix) fixes.push(fix);
  }
  if (trans) { const p = trans[0], pl = p === '_' ? 'space' : lab(p); why.push(`Most misses come right after ${pl} (${trans[1].m} of ${trans[1].n} times).`); const fix = transitionFix(k, s.arr.filter((t) => t.h !== k)); if (fix) fixes.push(fix); }
  if (!why.length) why.push(s.acc >= 0.95 ? `${pct(s.acc)}% clean, ${pct(s.prec)}% centered. Nothing to fix.` : 'No clear pattern yet. This usually settles after a few rounds.');
  if (!fixes.length && s.acc < 0.95) fixes.push(HOVER);
  return { headline, short, why, fixes: [...new Set(fixes)].slice(0, 3), tone: s.acc >= 0.95 ? 'good' : s.acc >= 0.88 ? 'warn' : 'bad' };
}
export function troubleKeys(taps: Tap[], max = 3) {
  const out: { k: string; s: KeyStats; pri: number }[] = [];
  for (const k of TRAINABLE) {
    const s = statsFor(taps, k);
    if (s.n >= 8 && (s.acc < 0.97 || s.mastery < 86)) out.push({ k, s, pri: (1 - s.acc) * 2 + (1 - s.prec) * 0.5 + Math.min(s.n, 60) / 600 });
  }
  return out.sort((a, b) => b.pri - a.pri).slice(0, max);
}
/* Zones: each letter row split between the thumbs (the usual T/Y, G/H, B/N handoff). Rows and thumbs are where real
   typing drift lives: rows pull up or down together, and each thumb leans to one side. Averaging a zone's taps shows
   those trends sooner than single keys, which are too noisy. Edge keys drift in mirror image (Q and A pull right when
   P and L pull left), so their drift is measured as inward, toward the middle, before pooling. */
export interface Zone { row: number; side: number; keys: string[] }
const ZONE_KEYS = [
  ['qwert', 'yuiop'],
  ['asdfg', 'hjkl'],
  ['zxcvb', 'nm'],
];
export const ZONES: Zone[] = ZONE_KEYS.flatMap((row, r) => row.map((keys, side) => ({ row: r, side, keys: keys.split('') })));
export const ROW_NAMES = ['Top row', 'Home row', 'Bottom row'];
const EDGE_KEYS = 'qazplm'.split('');
const keysWhere = (f: (z: Zone) => boolean) => new Set(ZONES.filter(f).flatMap((z) => z.keys));
/** Inward sideways drift: toward the middle of the keyboard is positive on both halves. */
const inward = (k: string, dx: number) => (LEFT.has(k) ? dx : -dx);

export interface ZoneStats { zone: Zone; n: number; acc: number; mx: number; my: number }
type KeyPool = { w: number; sx: number; sy: number; si: number };
interface Pool { n: number; w: number; w2: number; hit: number; sx: number; sy: number; si: number; sxx: number; syy: number; sii: number; keys: Record<string, KeyPool> }
function pool(taps: Tap[], wts: Float32Array, keys: Set<string>): Pool {
  const p: Pool = { n: 0, w: 0, w2: 0, hit: 0, sx: 0, sy: 0, si: 0, sxx: 0, syy: 0, sii: 0, keys: {} };
  taps.forEach((t, i) => {
    if (!keys.has(t.k) || wts[i] < 0.03) return;
    const w = wts[i], kk = (p.keys[t.k] ||= { w: 0, sx: 0, sy: 0, si: 0 });
    const ix = inward(t.k, t.dx);
    p.n++; p.w += w; p.w2 += w * w; p.sx += w * t.dx; p.sy += w * t.dy; p.si += w * ix; p.sxx += w * t.dx * t.dx; p.syy += w * t.dy * t.dy; p.sii += w * ix * ix;
    if (t.h === t.k) p.hit += w;
    kk.w += w; kk.sx += w * t.dx; kk.sy += w * t.dy; kk.si += w * ix;
  });
  return p;
}
export function zoneStats(taps: Tap[], half = recentHalf()): ZoneStats[] {
  const wts = recencyWeights(taps, half);
  return ZONES.map((zone) => {
    const p = pool(taps, wts, new Set(zone.keys));
    return { zone, n: p.n, acc: p.w ? p.hit / p.w : 0, mx: p.w ? p.sx / p.w : 0, my: p.w ? p.sy / p.w : 0 };
  });
}
/** Standard error of a pooled weighted mean, from its sum and sum of squares (neff = effective sample size). */
function se(p: Pool, sum: number, sq: number) {
  const m = sum / p.w, sd = Math.sqrt(Math.max(0, sq / p.w - m * m));
  return sd / Math.sqrt((p.w * p.w) / p.w2);
}
/** A trend has to be at least a point and clearly more than the scatter of the taps behind it could make by chance. */
const real = (d: number, err: number) => Math.abs(d) >= Math.max(1, 2.5 * err);
/** How many of the group's keys (with enough taps) lean the same way as the pooled value; trends need most to agree. */
function agree(p: Pool, val: (k: KeyPool) => number, sign: number) {
  const ks = Object.values(p.keys).filter((k) => k.w >= 2);
  return ks.length >= 2 && ks.filter((k) => Math.sign(val(k)) === sign).length >= Math.ceil((ks.length * 2) / 3);
}
/** `m` ranks findings by size (points of drift); all-clear findings are 0. */
export type Finding = { t: string; v: string; p: string; m?: number };
/** Row and edge trends, only where the pooled drift is clearly real (see `real`) and most keys in the group agree. */
export function zoneFindings(taps: Tap[], half = recentHalf()): Finding[] {
  const wts = recencyWeights(taps, half), out: Finding[] = [];
  const all = pool(taps, wts, new Set(ZONES.flatMap((z) => z.keys)));
  if (all.n < 30) return out;
  const myAll = all.sy / all.w;
  if (real(myAll, se(all, all.sy, all.syy))) out.push({ t: myAll > 0 ? 'You land low overall' : 'You land high overall', v: `${fmt1(Math.abs(myAll))} pt`, p: myAll > 0 ? 'The most common thumb pattern. Aim at the top of each letter.' : 'Usually a low grip. Hold the phone a little higher.', m: Math.abs(myAll) });
  else out.push({ t: 'Vertical aim is centered', v: `${fmt1(Math.abs(myAll))} pt`, p: 'Misses come from left-right drift or spread instead.', m: 0 });
  // rows, against the home row: the top and bottom rows are the long reaches, and usually move in opposite directions
  const rows = ROW_NAMES.map((_, r) => pool(taps, wts, keysWhere((z) => z.row === r))), home = rows[1];
  if (home.n >= 12) {
    const homeMy = home.sy / home.w;
    const lean = [0, 2].map((r) => {
      const p = rows[r], d = p.w ? p.sy / p.w - homeMy : 0;
      // two rows are tested, so each needs a wider margin than a single trend
      const ok = p.n >= 12 && real(d, Math.hypot(se(p, p.sy, p.syy), se(home, home.sy, home.syy)) * 1.2) && agree(p, (k) => k.sy / k.w - homeMy, Math.sign(d));
      return ok ? d : 0;
    });
    // the pull is tested as one measure, half the gap between the top and bottom rows, which is steadier than either
    // row against home; the rows only have to sit on the expected sides of home
    const T0 = rows[0], B2 = rows[2], tMy = T0.w ? T0.sy / T0.w - homeMy : 0, bMy = B2.w ? B2.sy / B2.w - homeMy : 0;
    const gap = (tMy - bMy) / 2, gapErr = (Math.hypot(se(T0, T0.sy, T0.syy), se(B2, B2.sy, B2.syy)) / 2) * 1.2;
    const both = T0.n >= 12 && B2.n >= 12 && real(gap, gapErr) && Math.sign(tMy) === Math.sign(gap) && Math.sign(bMy) === -Math.sign(gap);
    const [top, bot] = both ? [tMy, bMy] : lean;
    if (top > 0 && bot < 0) out.push({ t: 'Your taps pull toward the home row', v: `${fmt1((top - bot) / 2)} pt`, p: `The top row lands ${fmt1(top)} pt low and the bottom row ${fmt1(-bot)} pt high. Reach a little further up and down from the home row.`, m: (top - bot) / 2 });
    else if (top < 0 && bot > 0) out.push({ t: 'Your taps drift away from the home row', v: `${fmt1((bot - top) / 2)} pt`, p: `The top row lands ${fmt1(-top)} pt high and the bottom row ${fmt1(bot)} pt low. Stop a little short on the outer rows.`, m: (bot - top) / 2 });
    else
      lean.forEach((d, i) => {
        if (!d) return;
        const where = i ? 'Z to M' : 'Q to P';
        out.push({ t: `${i ? 'Bottom' : 'Top'} row lands ${d > 0 ? 'lower' : 'higher'} than the home row`, v: `${fmt1(Math.abs(d))} pt`, p: `Aim a touch ${d > 0 ? 'higher' : 'lower'} on ${where}.`, m: Math.abs(d) });
      });
  }
  // each thumb's sideways lean across all its keys
  ([['left', 0], ['right', 1]] as const).forEach(([name, side]) => {
    const p = pool(taps, wts, keysWhere((z) => z.side === side));
    if (p.n < 20) return;
    const mx = p.sx / p.w;
    // two thumbs are tested, so each needs the same wider margin as the rows
    if (!real(mx, se(p, p.sx, p.sxx) * 1.2) || !agree(p, (k) => k.sx / k.w, Math.sign(mx))) return;
    const dir = mx > 0 ? 'right' : 'left', back = mx > 0 ? 'left' : 'right', toCenter = (side === 0) === (mx > 0);
    out.push({ t: `Your ${name} thumb lands ${dir}`, v: `${fmt1(Math.abs(mx))} pt`, p: `Across its keys, ${toCenter ? 'past where you aim, toward the middle' : 'short of the middle, toward the screen edge'}. Aim a touch ${back} with your ${name} thumb.`, m: Math.abs(mx) });
  });
  // edges, pooled as inward drift
  const edges = new Set(EDGE_KEYS), e = pool(taps, wts, edges), inner = pool(taps, wts, new Set(ZONES.flatMap((z) => z.keys).filter((k) => !edges.has(k))));
  if (e.n >= 12 && inner.n >= 12) {
    const inw = e.si / e.w, ea = e.hit / e.w, ma = inner.hit / inner.w, costs = ea < ma - 0.03, vs = costs ? ` ${pct(ea)}% vs ${pct(ma)}% for the rest.` : '';
    if (real(inw, se(e, e.si, e.sii)) && agree(e, (k) => k.si / k.w, Math.sign(inw)))
      out.push(inw > 0
        ? { t: 'Edge keys pull inward', v: `${fmt1(inw)} pt`, p: `Q, A, Z, P, L and M land toward the middle. Reach all the way out.${vs}`, m: inw }
        : { t: 'Edge keys overshoot', v: `${fmt1(-inw)} pt`, p: `Q, A, Z, P, L and M land toward the screen edge. Stop a little sooner.${vs}`, m: -inw });
    else out.push(costs
      ? { t: 'Edge keys cost you', v: `${pct(ea)}% vs ${pct(ma)}%`, p: 'No steady lean, so it is spread. Slow down on Q, A, Z, P, L and M.', m: 0.5 }
      : { t: 'Edge keys hold up', v: `${pct(ea)}% vs ${pct(ma)}%`, p: 'The outer keys keep pace with the middle. Reach is fine.', m: 0 });
  }
  return out;
}

/**
 * A concrete thumb motion for misses that happen on the way into a key from one particular letter, or null when
 * the misses don't share a previous letter.
 */
export function transitionFix(k: string, misses: Tap[]): string | null {
  const prev: Record<string, number> = {};
  for (const t of misses) if (t.p) prev[t.p] = (prev[t.p] || 0) + 1;
  const top = Object.entries(prev).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < Math.max(2, misses.length / 2)) return null;
  const L = lab(k), p = top[0] === '_' ? 'space' : top[0], P = p === 'space' ? 'space' : lab(p);
  if (p === 'space') return `After space, lift your thumb off the bar before your thumb comes down on ${L}.`;
  const side = (x: string) => (LEFT.has(x) ? 'left' : RIGHT.has(x) ? 'right' : null);
  const a = side(p), b = side(k);
  if (a && b && a !== b) return `When ${L} follows ${P}, lift your ${a} thumb off ${P} before your ${b} thumb lands on ${L}.`;
  if (p === k) return `On double ${L}s, let your thumb come fully up between the two taps.`;
  return `After ${P}, move your thumb all the way over to ${L} before you press, not while you press.`;
}

