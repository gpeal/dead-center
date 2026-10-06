import { useCallback, useState, type ReactNode } from 'react';
import { useActions, useScheme } from './common';
import { hitTest, TRAINABLE } from '../lib/keys';
import { KeyboardView } from './KeyboardView';
import { drawZones, ZONE_SCALE } from '../lib/draw';
import type { Kb } from '../lib/keyboard';
import type { Tap } from '../lib/store';

/**
 * A results map with a strip above the keyboard the same height as the Keys view's magnifiers (same formula as
 * MissMap), so the keyboard sits in the same place in every view. Tapping a key opens its detail.
 */
export function StripMap({ paint: draw, strip }: { paint: (kb: Kb) => void; strip: ReactNode }) {
  const { openKey } = useActions();
  const [stripH, setStripH] = useState(130);
  const paint = useCallback((kb: Kb) => {
    draw(kb);
    setStripH(Math.min(112, Math.floor((kb.el.clientWidth - 20) / 3)) + 26);
  }, [draw]);
  const onTap = useCallback((x: number, y: number) => {
    const k = hitTest(x, y);
    if (TRAINABLE.includes(k)) openKey(k);
  }, [openKey]);
  return (
    <div className="zonemap">
      <div className="zstrip" style={{ height: stripH }}>{strip}</div>
      <KeyboardView className="mapwrap" paint={paint} onTap={onTap}><canvas /></KeyboardView>
    </div>
  );
}

/** The round's taps by zone (see ZONES in analysis): rows split by side, one averaged drift arrow each. */
export function ZoneMap({ taps, strip }: { taps: Tap[]; strip: ReactNode }) {
  const scheme = useScheme();
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawZones(cv, kb, taps);
  }, [taps, scheme]);
  return <StripMap paint={paint} strip={strip} />;
}

export function ZoneLegend() {
  return (
    <div className="legend">
      <span className="dot" style={{ background: 'var(--green)' }} />&lt;3% <span className="dot" style={{ background: 'var(--gold)' }} />3–9% <span className="dot" style={{ background: 'var(--red)' }} />9%+ <span>missed</span> <span>arrow = average drift, {ZONE_SCALE}×</span>
    </div>
  );
}
