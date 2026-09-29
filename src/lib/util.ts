export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const median = (a: number[]) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y), m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
export const pct = (v: number) => Math.round(v * 100);
export const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const ymd = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const today = () => ymd(new Date());
export const dayDiff = (a: string, b: string) => Math.round((+new Date(b + 'T12:00') - +new Date(a + 'T12:00')) / 864e5);
export function rng(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function gauss(r: () => number) {
  let u = 0;
  while (!u) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const IN_FRAME = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
export const COARSE = matchMedia('(pointer: coarse)').matches;
export function relDate(ts: number) {
  const d = new Date(ts);
  const dd = dayDiff(ymd(d), today());
  const tm = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return dd === 0 ? `Today ${tm}` : dd === 1 ? `Yesterday ${tm}` : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
export function shuffle<T>(a: T[], r = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
