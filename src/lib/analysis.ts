import { KEY, TRAINABLE, LEFT, RIGHT, HANDOFF, EDGE, edist, lab } from './keys';
import { median, pct, fmt1 } from './util';
import type { Tap, Session } from './store';

export interface KeyStats {
  /** n and hits are raw counts of the taps considered; acc, prec, drift and spread are recency weighted. */
  k: string; n: number; neff: number; hits: number; acc: number; prec: number; mastery: number;
  mx: number; my: number; sdx: number; sdy: number; conf: Record<string, number>; dtH: number[]; dtM: number[]; arr: Tap[];
}
/**
 * Recency weighting (an exponential moving average): each tap on a key counts half as much for every RECENT later
 * taps on that same key. Decaying per key rather than per round keeps rare letters like Q from fading to nothing.
 * RECENT is "how you type now"; SLOW is the long-run baseline that changes are measured against; ALL is unweighted.
 */
export const RECENT = 30, SLOW = 150, ALL = Infinity;
export function statsFor(taps: Tap[], k: string, half = RECENT): KeyStats {
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
  const mx = sx / W, my = sy / W, sdx = Math.sqrt(Math.max(0, sxx / W - mx * mx)), sdy = Math.sqrt(Math.max(0, syy / W - my * my));
  const acc = wHit / W, prec = wHit ? ps / wHit : 0;
  // effective sample size: how many equally weighted taps the weighted ones are worth
  const neff = (W * W) / W2;
  return { k, n, neff, hits, acc, prec, mx, my, sdx, sdy, conf, dtH, dtM, arr, mastery: Math.round(100 * (0.78 * acc + 0.22 * prec)) };
}
/** Each tap's recency weight (see statsFor), aligned with `taps`. */
export function recencyWeights(taps: Tap[], half = RECENT) {
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
  const slow = statsFor(taps, k, SLOW);
  if (slow.n < 20) return null;
  return statsFor(taps, k, RECENT).acc - slow.acc;
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
/** What to change for the thumb that misses more, from which way its misses drift. */
function sideTip(side: 'left' | 'right', taps: Tap[]) {
  const miss = taps.filter((t) => t.h !== t.k);
  const mx = miss.length ? miss.reduce((a, t) => a + t.dx, 0) / miss.length : 0, my = miss.length ? miss.reduce((a, t) => a + t.dy, 0) / miss.length : 0;
  const inward = side === 'left' ? mx > 0 : mx < 0;
  if (Math.abs(my) > Math.abs(mx)) return my > 0 ? `Aim your ${side} thumb at the top edge of each letter: its misses land low.` : `Let your ${side} thumb drop onto the lower half of each letter: its misses land high.`;
  return inward ? `Aim your ${side} thumb a little toward its own edge of the keyboard: its misses drift toward the middle.` : `Bring your ${side} thumb onto keys from below, not from the side: its misses drift outward.`;
}
export function troubleKeys(taps: Tap[], max = 3) {
  const out: { k: string; s: KeyStats; pri: number }[] = [];
  for (const k of TRAINABLE) {
    const s = statsFor(taps, k);
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
    out.push({ t: Math.abs(la - ra) < 0.02 ? 'Both thumbs are even' : la < ra ? 'Left thumb misses more' : 'Right thumb misses more', v: `L ${pct(la)}% · R ${pct(ra)}%`, p: Math.abs(la - ra) < 0.02 ? 'Both halves are within two points.' : sideTip(la < ra ? 'left' : 'right', la < ra ? lh : rh) });
  }
  // a miss counts as rushed when it came clearly faster than that key's own hits (the letter before sets the pace,
  // so comparing across keys would mostly measure which letters came first)
  const okDt = (t: Tap) => t.dt > 0 && t.dt < 2500, hitMed: Record<string, number> = {};
  for (const k of new Set(L.map((t) => t.k))) {
    const h = L.filter((t) => t.k === k && t.h === k && okDt(t)).map((t) => t.dt);
    if (h.length >= 5) hitMed[k] = median(h);
  }
  const timed = L.filter((t) => t.h !== t.k && okDt(t) && hitMed[t.k]);
  if (timed.length >= 6) {
    const rushed = timed.filter((t) => t.dt < 0.8 * hitMed[t.k]);
    const pair = Object.entries(rushed.reduce<Record<string, Tap[]>>((a, t) => ((a[t.k] ||= []).push(t), a), {})).sort((a, b) => b[1].length - a[1].length)[0];
    const fix = rushed.length / timed.length >= 0.5 && pair ? transitionFix(pair[0], pair[1]) : null;
    out.push(fix
      ? { t: 'Misses come when you rush', v: `${rushed.length} of ${timed.length}`, p: fix }
      : { t: 'Speed is not the problem', v: `${rushed.length} of ${timed.length}`, p: 'Most misses come at your normal rhythm, so aim is the thing to work on.' });
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

/**
 * One thing to do differently with your thumb next round, based on this round's taps. Always returns a tip: it
 * starts from the most-missed key's pattern, and falls back to centering or pace when there is nothing to fix.
 */
export function thumbTip(taps: Tap[], caseSlips: number, prec: number): string {
  const byKey: Record<string, Tap[]> = {};
  for (const t of taps) if (t.h !== t.k) (byKey[t.k] ||= []).push(t);
  const top = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length)[0];
  if (caseSlips >= 2 && (!top || top[1].length <= caseSlips)) return 'Tap Shift, then let the capitals appear before your thumb moves to the letter.';
  if (top && top[1].length >= 2) {
    const [k, misses] = top, L = lab(k), key = KEY[k];
    const mx = misses.reduce((a, t) => a + t.dx, 0) / misses.length, my = misses.reduce((a, t) => a + t.dy, 0) / misses.length;
    // rushing: this key's misses came clearly faster than its own hits (timing depends on the letter before, so
    // comparing against other keys would mostly measure that)
    const okDt = (t: Tap) => t.dt > 0 && t.dt < 2500;
    const hitDt = taps.filter((t) => t.k === k && t.h === k && okDt(t)).map((t) => t.dt), missDt = misses.filter(okDt).map((t) => t.dt);
    const onto = Object.entries(misses.reduce<Record<string, number>>((a, t) => ((a[t.h] = (a[t.h] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0][0];
    if (k === 'space') return my < 0 ? 'Tap space low, near its bottom edge, so your thumb stays clear of the letters above.' : SPACE_ALT;
    if (k === 'shift') return 'Reach all the way to Shift with a flatter thumb so the pad, not the tip, lands on it.';
    if (missDt.length >= 3 && hitDt.length >= 3 && median(missDt) < 0.8 * median(hitDt)) {
      const fix = transitionFix(k, misses);
      if (fix) return fix;
    }
    const inward = (LEFT.has(k) && mx > 0) || (RIGHT.has(k) && mx < 0);
    if (Math.abs(my) >= Math.abs(mx) * 0.8) {
      if (my > 0) return `Aim your thumb at the top edge of ${L}: the pad lands lower than the point you look at.`;
      return `Let your thumb drop onto the lower half of ${L} instead of stretching up to it.`;
    }
    // sideways onto a key the other thumb owns: usually a thumb switch mid-word
    if (HANDOFF.has(k) && ((LEFT.has(k) && RIGHT.has(onto)) || (RIGHT.has(k) && LEFT.has(onto)))) return `Type ${L} with your ${LEFT.has(k) ? 'left' : 'right'} thumb every time, even mid‑word.`;
    if (EDGE.has(k) && inward) return `Reach past ${L} and land on its outer edge: your thumb is stopping short.`;
    if (inward) return `Aim ${L} a hair toward the outside edge, away from where your thumb comes from.`;
    if (key) return `Bring your thumb onto ${L} from below, not from the side, so it lands where you aim.`;
  }
  // nothing to fix key by key: look for an offset shared across keys, then spread, then pace
  const letters = taps.filter((t) => KEY[t.k]?.type === 'letter');
  const avg = (a: Tap[], f: (t: Tap) => number) => (a.length ? a.reduce((s, t) => s + f(t), 0) / a.length : 0);
  const topRow = letters.filter((t) => KEY[t.k].row === 0), lower = letters.filter((t) => KEY[t.k].row > 0);
  if (topRow.length >= 8 && lower.length >= 8 && avg(topRow, (t) => t.dy) > 2 && avg(topRow, (t) => t.dy) - avg(lower, (t) => t.dy) > 1.5)
    return 'On the top row, straighten your thumb so the pad reaches the letter instead of stopping under it.';
  const dy = avg(letters, (t) => t.dy);
  if (dy > 1.5) return 'Aim for the top third of every key: your thumb pad keeps landing below where you look.';
  if (dy < -1.5) return 'Let your thumbs drop onto the lower half of each key instead of stretching up to it.';
  const lh = letters.filter((t) => LEFT.has(t.k)), rh = letters.filter((t) => RIGHT.has(t.k));
  const lIn = lh.length >= 8 && avg(lh, (t) => t.dx) > 1.2, rIn = rh.length >= 8 && avg(rh, (t) => t.dx) < -1.2;
  if (lIn && rIn) return 'Aim each thumb a little toward its own edge: both drift toward the middle of the keyboard.';
  if (lIn) return 'Aim your left thumb a little toward the left edge: it lands right of where you aim.';
  if (rIn) return 'Aim your right thumb a little toward the right edge: it lands left of where you aim.';
  if (prec < 0.6) return HOVER;
  return 'Start your next thumb toward its key while the other is still tapping, so they take turns.';
}
