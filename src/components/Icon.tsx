import type { SVGProps } from 'react';

type Def = { vb: string; w?: number; h?: number; stroke?: boolean; inner: string; hidden?: boolean };
const line = (inner: string): Def => ({ vb: '0 0 24 24', stroke: true, inner });

const DEFS = {
  shiftOn: { vb: '0 0 20 17.3', w: 20, h: 17.3, inner: '<path d="M10 1.2 18.6 9.7H14.1V15.6Q14.1 16.4 13.3 16.4H6.7Q5.9 16.4 5.9 15.6V9.7H1.4Z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' },
  shiftCaps: { vb: '0 0 20 17.3', w: 20, h: 17.3, inner: '<path d="M10 1.1 18.6 8.5H14.1V11.3Q14.1 12 13.4 12H6.6Q5.9 12 5.9 11.3V8.5H1.4Z" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><rect x="5.9" y="14.2" width="8.2" height="2.4" rx=".7" fill="currentColor"/>' },
  shiftOff: { vb: '0 0 20 17.3', w: 20, h: 17.3, inner: '<path d="M10 1.4 18.4 9.7H14.1V15.6Q14.1 16.4 13.3 16.4H6.7Q5.9 16.4 5.9 15.6V9.7H1.6Z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>' },
  del: { vb: '0 0 20.3 17', w: 20.3, h: 17, inner: '<path d="M6.7 1.1H17.4Q19.4 1.1 19.4 3.1V13.9Q19.4 15.9 17.4 15.9H6.7L.9 8.5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.9 5.4 15.6 11.1M15.6 5.4 9.9 11.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  ret: { vb: '0 0 19.7 17', w: 19.7, h: 17, inner: '<path d="M18.4 1.2V8.9Q18.4 10.9 16.4 10.9H2.2M6.8 6.3 2.2 10.9 6.8 15.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' },
  emoji: { vb: '0 0 27 27', w: 27, h: 27, inner: '<circle cx="13.5" cy="13.5" r="12.4" fill="none" stroke="currentColor" stroke-width="1.9"/><ellipse cx="9.4" cy="10.1" rx="1.7" ry="2.3" fill="currentColor"/><ellipse cx="17.6" cy="10.1" rx="1.7" ry="2.3" fill="currentColor"/><path d="M6.5 14.4H20.5Q20.3 21 13.5 21.3 6.7 21 6.5 14.4Z" fill="currentColor"/><path d="M8.2 16.2H18.8" style="stroke:var(--kb-bg)" stroke-width="1.4"/>' },
  mic: { vb: '0 0 18.3 20.7', w: 18.3, h: 20.7, inner: '<rect x="5.6" y="1" width="7.1" height="11.6" rx="3.55" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.9 9.1Q1.9 15.7 9.15 15.7 16.4 15.7 16.4 9.1M9.15 15.7V19.6M4.9 19.6H13.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  siri: { vb: '0 0 18 18', inner: '<circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M1.6 9.6C4 6.8 6.6 6.8 9 9.2S14 11.6 16.4 8.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
  logo: { vb: '0 0 32 32', hidden: true, inner: '<circle cx="16" cy="16" r="14.4" fill="none" style="stroke:var(--ink)" stroke-width="2.2"/><circle cx="16" cy="16" r="9" fill="none" style="stroke:var(--accent)" stroke-width="2.2"/><rect x="12" y="12" width="8" height="8" rx="2.4" style="fill:var(--gold)"/>' },
  target: line('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  kbd: line('<rect x="2.5" y="5.5" width="19" height="13" rx="3"/><path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M8 14h8"/>'),
  chart: line('<path d="M4 4v16h16"/><path d="M8 15l3.5-4.5 3 2.5L19 7"/>'),
  close: line('<path d="M6 6l12 12M18 6 6 18"/>'),
  soundOn: line('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: line('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  chev: line('<path d="M9 6l6 6-6 6"/>'),
  play: line('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  bolt: line('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" fill="currentColor" stroke="none"/>'),
  check: line('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  ruler: line('<rect x="2.5" y="7.5" width="19" height="9" rx="2"/><path d="M7 7.5v3M11 7.5v4.5M15 7.5v3M19 7.5v4.5"/>'),
  wrench: line('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  cross: line('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  grid: line('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
  up: { vb: '0 0 10 10', w: 9, h: 9, inner: '<path d="M5 1.5 8.5 6H1.5z" fill="currentColor"/>' },
  down: { vb: '0 0 10 10', w: 9, h: 9, inner: '<path d="M5 8.5 1.5 4h7z" fill="currentColor"/>' },
  share: line('<path d="M12 3.5v11"/><path d="M8 7.5l4-4 4 4"/><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>'),
  addbox: line('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
  guest: line('<circle cx="12" cy="12" r="9.5" stroke-dasharray="2.6 2.4"/><circle cx="12" cy="10" r="2.7"/><path d="M7.4 17.4c1-2.2 2.7-3.3 4.6-3.3s3.6 1.1 4.6 3.3"/>'),
  person: line('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c1.2-3.6 3.9-5.4 7.2-5.4s6 1.8 7.2 5.4"/>'),
  copy: line('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
} satisfies Record<string, Def>;

export type IconName = keyof typeof DEFS;
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const d: Def = DEFS[name];
  return <svg viewBox={d.vb} width={d.w} height={d.h} aria-hidden={d.hidden || undefined} {...(d.stroke ? STROKE : null)} {...rest} dangerouslySetInnerHTML={{ __html: d.inner }} />;
}

/** The same icon as an HTML string, for the imperative keyboard. */
export function iconHtml(name: IconName) {
  const d: Def = DEFS[name];
  const size = d.w ? ` width="${d.w}" height="${d.h}"` : '';
  const stroke = d.stroke ? ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : '';
  return `<svg viewBox="${d.vb}"${size}${stroke}>${d.inner}</svg>`;
}

export function Ring({ v, color, size = 40, sw = 4 }: { v: number; color: string; size?: number; sw?: number }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  return (
    <svg viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--surface-2)' }} strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: color }} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${c * Math.max(0, Math.min(1, v))} ${c}`} />
    </svg>
  );
}
