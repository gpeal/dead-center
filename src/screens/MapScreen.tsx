import { useCallback, useMemo, useState } from 'react';
import { SectionH, Topbar, useActions, useScheme, TrendPill } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { ALL, keyTrend, recentHalf, masteryLabel, patterns, statsFor, toneColor } from '../lib/analysis';
import { drawMap, type MapMode } from '../lib/draw';
import { ZoneLegend } from '../components/ZoneMap';
import { glyph, hitTest, lab, TRAINABLE } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import { dataset, useStore } from '../lib/store';
import { pct } from '../lib/util';

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

export function MapScreen() {
  const version = useStore();
  const { start, openKey } = useActions();
  const [mode, setMode] = useState<MapMode>(MODES[0][0]);
  const [range, setRange] = useState<'recent' | 'all'>('recent');
  const half = range === 'recent' ? recentHalf() : ALL;
  const scheme = useScheme();
  const ds = useMemo(() => dataset(), [version]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawMap(cv, kb, ds.taps, mode, half);
  }, [ds, mode, half, scheme]);
  const onTap = useCallback((x: number, y: number) => {
    const k = hitTest(x, y);
    if (TRAINABLE.includes(k)) openKey(k);
  }, [openKey]);
  const low = useMemo(() => TRAINABLE.map((k) => statsFor(ds.taps, k, half)).filter((s) => s.n >= 5).sort((a, b) => a.acc - b.acc).slice(0, 5), [ds, half]);
  const pats = useMemo(() => patterns(ds.taps), [ds]);

  return (
    <main className="screen">
      <Topbar />
      <SectionH title="Your tap map">
        <div className="seg small" role="group" aria-label="Which taps">
          {([['recent', 'Recent'], ['all', 'All time']] as const).map(([r, l]) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>
          ))}
        </div>
      </SectionH>
      {ds.sample && (
        <div className="samplebar">
          <div><b>Example data.</b> Take the baseline to see yours.</div>
          <button className="btn primary" onClick={() => start('baseline')}>Start</button>
        </div>
      )}
      <section className="card mapcard">
        <div className="seg" role="group" aria-label="Map view">
          {MODES.map(([m, l]) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>
          ))}
        </div>
        <KeyboardView className="mapwrap" paint={paint} onTap={onTap}>
          <canvas />
        </KeyboardView>
        <Legend mode={mode} recent={range === 'recent'} taps={ds.taps.length} />
      </section>
      {!low.length && <div className="card small muted">No taps yet. Finish a round and your map fills in.</div>}
      {low.length > 0 && <SectionH title="Lowest accuracy"><span className="eyebrow">Tap a key</span></SectionH>}
      {low.length > 0 && <section className="card" style={{ padding: '14px 16px' }}>
        <div className={'rowbars' + (range === 'recent' ? ' trends' : '')}>
          {low.map((s) => (
            <button key={s.k} className="krowbar" aria-label={`${lab(s.k)}: ${pct(s.acc)}% accurate. Open tap map`} onClick={() => openKey(s.k)}>
              <span className="kc sm">{glyph(s.k)}</span>
              <span className="track"><i style={{ width: pct(s.acc) + '%', background: toneColor(masteryLabel(s.mastery)[1]) }} /></span>
              <span className="m">{pct(s.acc)}%</span>
              {range === 'recent' && <TrendPill tr={keyTrend(ds.taps, s.k)} />}
            </button>
          ))}
        </div>
      </section>}
      {pats.length > 0 && (
        <>
          <SectionH title="Patterns"><span className="eyebrow">Last {Math.min(ds.taps.length, 3000).toLocaleString()} taps</span></SectionH>
          <section className="card">
            <div className="patterns">
              {pats.map((p, i) => (
                <div className="prow" key={i}>
                  <b>{p.t}</b>
                  <span className="mono small">{p.v}</span>
                  <p>{p.p}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

