import { useCallback, useState } from 'react';
import { SectionH, useActions, useScheme } from './common';
import { KeyboardView } from './KeyboardView';
import { ZoneLegend } from './ZoneMap';
import { ALL, recentHalf } from '../lib/analysis';
import { drawMap, type MapMode } from '../lib/draw';
import { hitTest, TRAINABLE } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { Tap } from '../lib/store';

const MODES: [MapMode, string][] = [['zones', 'Zones'], ['miss', 'Misses'], ['aim', 'Aim'], ['heat', 'Heat']];

function Legend({ mode, recent, taps }: { mode: MapMode; recent: boolean; taps: number }) {
  const note = recent ? 'recent taps count most' : `all ${taps.toLocaleString()} taps`;
  if (mode === 'heat')
    return (
      <div className="legend">
        <span>Fewer taps</span>
        <span className="ramp" style={{ background: 'linear-gradient(90deg,rgba(36,88,240,.25),rgba(80,140,255,.7),rgba(245,179,1,.85),rgba(229,72,77,.9),rgb(170,20,50))' }} />
        <span>More · {note}</span>
      </div>
    );
  if (mode === 'aim')
    return (
      <div className="legend">
        <span>ring holds 86% of taps; on the key:</span> <span className="dot" style={{ background: 'var(--green)' }} />95%+ <span className="dot" style={{ background: 'var(--gold)' }} />80–95% <span className="dot" style={{ background: 'var(--red)' }} />less <span>· line = drift{recent ? ', faint = earlier' : ''}</span>
      </div>
    );
  if (mode === 'zones') return <ZoneLegend />;
  return (
    <div className="legend">
      <span className="dot" style={{ background: 'var(--green)' }} />under 3% <span className="dot" style={{ background: 'var(--gold)' }} />3–9% <span className="dot" style={{ background: 'var(--red)' }} />over 9% <span>of taps missed · {note}</span>
    </div>
  );
}

/** The tap map card on the Progress tab: every tap on a full keyboard, in four views. Tap a key for its detail. */
export function TapMap({ taps }: { taps: Tap[] }) {
  const { openKey } = useActions();
  const [mode, setMode] = useState<MapMode>(MODES[0][0]);
  const [range, setRange] = useState<'recent' | 'all'>('recent');
  const half = range === 'recent' ? recentHalf() : ALL;
  const scheme = useScheme();
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawMap(cv, kb, taps, mode, half);
  }, [taps, mode, half, scheme]);
  const onTap = useCallback((x: number, y: number) => {
    const k = hitTest(x, y);
    if (TRAINABLE.includes(k)) openKey(k);
  }, [openKey]);

  return (
    <>
      <SectionH title="Tap map">
        <div className="seg small" role="group" aria-label="Which taps">
          {([['recent', 'Recent'], ['all', 'All time']] as const).map(([r, l]) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>
          ))}
        </div>
      </SectionH>
      <section className="card mapcard">
        <div className="seg" role="group" aria-label="Map view">
          {MODES.map(([m, l]) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>
        <KeyboardView className="mapwrap" paint={paint} onTap={onTap}>
          <canvas />
        </KeyboardView>
        <Legend mode={mode} recent={range === 'recent'} taps={taps.length} />
      </section>
    </>
  );
}
