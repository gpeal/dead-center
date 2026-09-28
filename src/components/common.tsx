import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from './Icon';
import { lab } from '../lib/keys';
import { streakNow } from '../lib/game';
import type { Mode } from '../lib/store';
import { clamp } from '../lib/util';

export type Tab = 'home' | 'map' | 'progress';
export interface Actions {
  go(tab: Tab): void;
  openKey(k: string): void;
  start(mode: Mode, focus?: string[]): void;
}
export const ActionsContext = createContext<Actions | null>(null);
export const useActions = () => useContext(ActionsContext)!;

export function Kc({ k, size }: { k: string; size?: 'sm' | 'lg' }) {
  const cls = 'kc' + (size ? ' ' + size : '');
  if (k === 'shift')
    return (
      <span className={cls} aria-label="Shift">
        <Icon name="shiftOff" />
      </span>
    );
  return <span className={cls + (k === 'space' ? ' wide' : '')}>{k === 'space' ? 'space' : lab(k)}</span>;
}

export function Topbar() {
  const st = streakNow();
  return (
    <header className="topbar">
      <div className="brand">
        <Icon name="logo" />
        <b>Dead Center</b>
      </div>
      <div className="chips">
        {st > 0 && (
          <span className="chip gold" title="Day streak">
            <Icon name="flame" />
            {st}
          </span>
        )}
      </div>
    </header>
  );
}

export function SectionH({ title, children, id }: { title: string; children?: ReactNode; id?: string }) {
  return (
    <div className="section-h" id={id}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function TrendPill({ tr }: { tr: number | null }) {
  if (tr == null) return <span className="trend flat">new</span>;
  const v = Math.round(tr * 100);
  if (Math.abs(v) < 2) return <span className="trend flat">steady</span>;
  return v > 0 ? (
    <span className="trend up">
      <Icon name="up" />
      {v}
    </span>
  ) : (
    <span className="trend down">
      <Icon name="down" />
      {-v}
    </span>
  );
}

/** Width of an element, tracked as it resizes. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current!;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
export interface Series { values: number[]; color: string; label: string; w?: number }
let gradId = 0;
export function LineChart({ series, yMin, yMax, ticks, fmt = (v) => String(v), height = 160, xLabel = (i) => '#' + (i + 1) }: {
  series: Series[]; yMin: number; yMax: number; ticks: number[]; fmt?: (v: number) => string; height?: number; xLabel?: (i: number) => string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [gid] = useState(() => 'g' + ++gradId);
  const W = Math.max(240, w || 320), H = height, pl = 34, pr = 16, pt = 14, pb = 22;
  const n = Math.max(...series.map((s) => s.values.length));
  const X = (i: number) => (n <= 1 ? pl + (W - pl - pr) / 2 : pl + (i * (W - pl - pr)) / (n - 1)), Y = (v: number) => pt + (1 - (v - yMin) / (yMax - yMin)) * (H - pt - pb);
  return (
    <div ref={ref}>
      {n > 0 && w > 0 && (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} by round`}>
          {ticks.map((t, i) => (
            <g key={t}>
              <line x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} style={{ stroke: 'var(--line)' }} strokeWidth="1" strokeDasharray={i === 0 ? undefined : '2 4'} />
              <text x={pl - 8} y={Y(t) + 3.5} textAnchor="end">{fmt(t)}</text>
            </g>
          ))}
          <text x={X(0)} y={H - 5} textAnchor={n > 1 ? 'start' : 'middle'}>{xLabel(0)}</text>
          {n > 1 && <text x={X(n - 1)} y={H - 5} textAnchor="end">{xLabel(n - 1)}</text>}
          {series.map((s, si) => {
            const pts = s.values.map((v, i): [number, number] => [X(i), Y(clamp(v, yMin, yMax))]);
            const lp = pts[pts.length - 1];
            return (
              <g key={s.label}>
                {si === 0 && pts.length > 1 && (
                  <>
                    <defs>
                      <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.22 }} />
                        <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <path d={`${smoothPath(pts)}L${lp[0]},${Y(yMin)}L${pts[0][0]},${Y(yMin)}Z`} fill={`url(#${gid})`} />
                  </>
                )}
                {pts.length > 1 && <path d={smoothPath(pts)} fill="none" style={{ stroke: s.color }} strokeWidth={s.w || 2.4} strokeLinecap="round" />}
                {lp && <circle cx={lp[0]} cy={lp[1]} r="4.5" style={{ fill: s.color, stroke: 'var(--surface)' }} strokeWidth="2.5" />}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Changes when the light/dark scheme does, so canvases (which read CSS colors once) can repaint. */
const darkMq = matchMedia('(prefers-color-scheme: dark)');
function subscribeScheme(l: () => void) {
  darkMq.addEventListener('change', l);
  const mo = new MutationObserver(l);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    darkMq.removeEventListener('change', l);
    mo.disconnect();
  };
}
export const useScheme = () => useSyncExternalStore(subscribeScheme, () => (document.documentElement.dataset.theme || '') + darkMq.matches);
