import { useCallback } from 'react';
import { useScheme } from './common';
import { KeyboardView } from './KeyboardView';
import { drawZones, ZONE_SCALE } from '../lib/draw';
import type { Kb } from '../lib/keyboard';
import type { Tap } from '../lib/store';

/** The round's taps by zone (see ZONES in analysis): rows split by side, one averaged drift arrow each. */
export function ZoneMap({ taps }: { taps: Tap[] }) {
  const scheme = useScheme();
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawZones(cv, kb, taps);
  }, [taps, scheme]);
  return <KeyboardView className="mapwrap" paint={paint}><canvas /></KeyboardView>;
}

export function ZoneLegend() {
  return (
    <div className="legend">
      <span className="dot" style={{ background: 'var(--green)' }} />&lt;3% <span className="dot" style={{ background: 'var(--gold)' }} />3–9% <span className="dot" style={{ background: 'var(--red)' }} />9%+ <span>missed</span> <span>arrow = average drift, {ZONE_SCALE}×</span>
    </div>
  );
}
