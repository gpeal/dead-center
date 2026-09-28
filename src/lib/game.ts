import { KEY, TRAINABLE, LETTERS } from './keys';
import { PANGRAMS, SENTENCES, WORDS } from './text';
import { statsFor, drillImpact } from './analysis';
import { shuffle, dayDiff, today } from './util';
import { store, allTaps, realSessions, type Session, type Mode } from './store';
import type { IconName } from '../components/Icon';

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

/* ================= gamification ================= */
const RANKS = ['Rookie', 'Tapper', 'Steady Hand', 'Marksman', 'Sharpshooter', 'Surgeon', 'Dead Center'];
export interface LevelInfo { lvl: number; into: number; need: number; rank: string }
export function levelInfo(xp: number): LevelInfo {
  let lvl = 1, base = 0, need = 150;
  while (xp >= base + need) {
    base += need;
    lvl++;
    need = Math.round(need * 1.12);
  }
  return { lvl, into: xp - base, need, rank: RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 3))] };
}
export interface Achievement { id: string; name: string; desc: string; ic: IconName }
export const ACH: Achievement[] = [
  { id: 'first', name: 'First contact', desc: 'Finish a round', ic: 'target' },
  { id: 'baseline', name: 'Calibrated', desc: 'Finish the baseline', ic: 'ruler' },
  { id: 'clean', name: 'Clean sheet', desc: 'Zero-miss round', ic: 'check' },
  { id: 'bull10', name: 'Ten ring', desc: '10 bullseyes in a row', ic: 'cross' },
  { id: 'combo50', name: 'Locked in', desc: '50-tap combo', ic: 'bolt' },
  { id: 'streak3', name: 'Habit forming', desc: '3-day streak', ic: 'flame' },
  { id: 'streak7', name: 'Full week', desc: '7-day streak', ic: 'flame' },
  { id: 'drill5', name: 'Drill sergeant', desc: 'Finish 5 drills', ic: 'target' },
  { id: 'fixer', name: 'Fixer', desc: 'Drilled key +10 pts', ic: 'wrench' },
  { id: 'quick', name: 'Quick draw', desc: '40 WPM, 95% acc', ic: 'bolt' },
  { id: 'k1', name: 'A thousand taps', desc: 'Log 1,000 taps', ic: 'kbd' },
  { id: 'allkeys', name: 'Full board', desc: 'All letters 90%+', ic: 'grid' },
];
export function checkAch(sess: Session) {
  const S = store.S, got: Achievement[] = [];
  const give = (id: string) => {
    if (!S.ach[id]) {
      S.ach[id] = Date.now();
      got.push(ACH.find((a) => a.id === id)!);
    }
  };
  const rs = realSessions(), t = allTaps();
  if (rs.length >= 1) give('first');
  if (sess.mode === 'baseline') give('baseline');
  if (sess.n >= 20 && sess.hits === sess.n) give('clean');
  if ((sess.bull || 0) >= 10) give('bull10');
  if ((sess.combo || 0) >= 50) give('combo50');
  if (S.streak.count >= 3) give('streak3');
  if (S.streak.count >= 7) give('streak7');
  if (rs.filter((s) => s.mode === 'drill').length >= 5) give('drill5');
  if ((sess.wpm || 0) >= 40 && sess.acc >= 0.95) give('quick');
  if (S.taps.length >= 1000) give('k1');
  if (!S.ach.fixer) {
    for (const k of TRAINABLE) {
      const d = drillImpact(t, rs, k);
      if (d && d.after - d.before >= 0.1) {
        give('fixer');
        break;
      }
    }
  }
  if (!S.ach.allkeys && LETTERS.every((k) => { const s = statsFor(t, k, 60); return s.n >= 10 && s.acc >= 0.9; })) give('allkeys');
  return got;
}
export const modeName = (s: Pick<Session, 'mode' | 'focus'>) =>
  s.mode === 'baseline' ? 'Baseline' : s.mode === 'drill' ? `Drill · ${(s.focus || '').split('').map((c) => (c === '_' ? 'Space' : c === '^' ? 'Shift' : c.toUpperCase())).join(' ')}` : 'Round';
export function streakNow() {
  const S = store.S;
  if (!S.streak.last) return 0;
  return dayDiff(S.streak.last, today()) <= 1 ? S.streak.count : 0;
}
