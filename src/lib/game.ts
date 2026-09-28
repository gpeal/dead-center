import { KEY, TRAINABLE } from './keys';
import { PANGRAMS, SENTENCES, WORDS } from './text';
import { statsFor } from './analysis';
import { shuffle, dayDiff, today } from './util';
import { store, allTaps, type Session, type Mode } from './store';

/* ================= practice text ================= */
function weights() {
  const t = allTaps(), w: Record<string, number> = {};
  for (const k of TRAINABLE) {
    const s = statsFor(t, k, 60);
    w[k] = s.n >= 6 ? 1 + 4 * (1 - s.acc) + 1.5 * (1 - s.prec) : 1.3;
  }
  return w;
}
function adaptiveLines(n: number) {
  const S = store.S, w = weights(), used = new Set(S.used.slice(-45));
  const cand = SENTENCES.map((s, i) => ({ i, s, sc: [...s].reduce((a, c) => a + (w[c === ' ' ? 'space' : c.toLowerCase()] || 1) + (c !== c.toLowerCase() ? w.shift : 0), 0) / s.length + Math.random() * 0.6 }))
    .filter((o) => !used.has(o.i))
    .sort((a, b) => b.sc - a.sc);
  const pick = shuffle(cand.slice(0, n * 3)).slice(0, n);
  const hasCap = (o: { s: string }) => /[A-Z]/.test(o.s.slice(1));
  if (n >= 2 && !pick.some(hasCap)) {
    const c = shuffle(cand.filter(hasCap))[0];
    if (c) pick[pick.length - 1] = c;
  }
  S.used.push(...pick.map((o) => o.i));
  S.used = S.used.slice(-80);
  return pick.map((o) => o.s);
}
function drillLines(focus: string[], n: number) {
  const F = new Set(focus.filter((k) => k !== 'space' && k !== 'shift')), sp = focus.includes('space'), sh = focus.includes('shift'), t = allTaps(), pairs: string[] = [];
  for (const k of focus) {
    const s = statsFor(t, k, 80);
    const top = Object.entries(s.conf).sort((a, b) => b[1] - a[1])[0];
    if (top && KEY[top[0]] && KEY[top[0]].type === 'letter' && k !== 'space') pairs.push(k + top[0], top[0] + k);
  }
  const sc = (w: string) => {
    let c = 0;
    for (const ch of w) if (F.has(ch)) c++;
    let b = 0;
    for (const p of pairs) if (w.includes(p)) b++;
    return c / Math.sqrt(w.length) + b * 0.8 + (sp ? 2.2 / w.length : 0);
  };
  const pool = WORDS.map((w) => ({ w, s: sc(w) + (sh ? 0.3 : 0) })).filter((o) => o.s > 0).sort((a, b) => b.s - a.s).slice(0, 90).map((o) => o.w);
  const dens = (s: string) => [...s].filter((c) => F.has(c.toLowerCase()) || (sp && c === ' ') || (sh && c !== c.toLowerCase())).length / s.length;
  const best = SENTENCES.map((s) => ({ s, d: dens(s) + Math.random() * 0.03 })).sort((a, b) => b.d - a.d);
  const lines = [best[Math.floor(Math.random() * 4)].s];
  while (lines.length < n) {
    const r = [...pool], line: string[] = [];
    let len = 0;
    while (len < 33 && r.length) {
      const w = r.splice(Math.floor(Math.random() * Math.min(r.length, 36)), 1)[0];
      if (line.includes(w)) continue;
      line.push(w);
      len += w.length + 1;
    }
    lines.push((sh ? line.map((w, i) => (i % 2 ? w[0].toUpperCase() + w.slice(1) : w)) : line).join(' '));
  }
  return lines;
}
export function linesFor(mode: Mode, focus: string[]) {
  const len = store.S.settings.len;
  const lines = mode === 'baseline' ? [...PANGRAMS] : mode === 'drill' ? drillLines(focus, len) : adaptiveLines(len);
  return lines.map((l) => l[0].toUpperCase() + l.slice(1));
}

export const modeName = (s: Pick<Session, 'mode' | 'focus'>) =>
  s.mode === 'baseline' ? 'Baseline' : s.mode === 'drill' ? `Drill · ${(s.focus || '').split('').map((c) => (c === '_' ? 'Space' : c === '^' ? 'Shift' : c.toUpperCase())).join(' ')}` : 'Round';
export function streakNow() {
  const S = store.S;
  if (!S.streak.last) return 0;
  return dayDiff(S.streak.last, today()) <= 1 ? S.streak.count : 0;
}
