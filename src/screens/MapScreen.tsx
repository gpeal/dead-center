import { useCallback, useMemo, useState } from 'react';
import { SectionH, Topbar, useActions, useScheme } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { masteryLabel, patterns, statsFor, toneColor } from '../lib/analysis';
import { drawMap, type MapMode } from '../lib/draw';
import { glyph, hitTest, lab, TRAINABLE } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import { dataset, useStore } from '../lib/store';
import { pct } from '../lib/util';

const MODES: [MapMode, string][] = [['heat', 'Heat'], ['aim', 'Aim'], ['miss', 'Misses']];

function Legend({ mode }: { mode: MapMode }) {
  if (mode === 'heat')
    return (
      <div className="legend">
        <span>Fewer taps</span>
        <span className="ramp" style={{ background: 'linear-gradient(90deg,rgba(36,88,240,.25),rgba(80,140,255,.7),rgba(245,179,1,.85),rgba(229,72,77,.9),rgb(170,20,50))' }} />
        <span>More</span>
      </div>
    );
  if (mode === 'aim')
    return (
      <div className="legend">
        <span className="dot" style={{ background: 'var(--green)' }} />under 1.6 pt <span className="dot" style={{ background: 'var(--gold)' }} />1.6–3.4 pt <span className="dot" style={{ background: 'var(--red)' }} />over 3.4 pt <span>· line = drift, ring = spread</span>
      </div>
    );
  return (
    <div className="legend">
      <span className="dot" style={{ background: 'var(--green)' }} />under 3% <span className="dot" style={{ background: 'var(--gold)' }} />3–9% <span className="dot" style={{ background: 'var(--red)' }} />over 9% <span>of taps missed</span>
    </div>
  );
}

export function MapScreen() {
  const version = useStore();
  const { start, openKey } = useActions();
  const [mode, setMode] = useState<MapMode>('heat');
  const scheme = useScheme();
  const ds = useMemo(() => dataset(), [version]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawMap(cv, kb, ds.taps, mode);
  }, [ds, mode, scheme]);
  const onTap = useCallback((x: number, y: number) => {
    const k = hitTest(x, y);
    if (TRAINABLE.includes(k)) openKey(k);
  }, [openKey]);
  const low = useMemo(() => TRAINABLE.map((k) => statsFor(ds.taps, k, 100)).filter((s) => s.n >= 5).sort((a, b) => a.acc - b.acc).slice(0, 5), [ds]);
  const pats = useMemo(() => patterns(ds.taps), [ds]);

  return (
    <main className="screen">
      <Topbar />
      <SectionH title="Your tap map">
        {ds.sample ? <span className="pill sample">Sample data</span> : <span className="eyebrow">{ds.taps.length.toLocaleString()} taps</span>}
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
        <Legend mode={mode} />
      </section>
      <SectionH title="Lowest accuracy"><span className="eyebrow">Tap a key</span></SectionH>
      <section className="card" style={{ padding: '14px 16px' }}>
        <div className="rowbars">
          {low.map((s) => (
            <button key={s.k} className="krowbar" aria-label={`${lab(s.k)}: ${pct(s.acc)}% accurate. Open tap map`} onClick={() => openKey(s.k)}>
              <span className="kc sm">{glyph(s.k)}</span>
              <span className="track"><i style={{ width: pct(s.acc) + '%', background: toneColor(masteryLabel(s.mastery)[1]) }} /></span>
              <span className="m">{pct(s.acc)}%</span>
            </button>
          ))}
        </div>
      </section>
      {pats.length > 0 && (
        <>
          <SectionH title="Patterns"><span className="eyebrow">Last {Math.min(ds.taps.length, 3000).toLocaleString()} taps</span></SectionH>
          <section className="card">
            <div className="patterns">
              {pats.map((p, i) =>
                'rows' in p ? (
                  <div className="prow" key={i}>
                    <b>Accuracy by row</b>
                    <span />
                    <div className="rowbars" style={{ gridColumn: '1/-1', marginTop: 6 }}>
                      {p.rows.filter((r) => r[1]).map(([n, o]) => (
                        <RowBar key={n} name={n} acc={o!.acc} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="prow" key={i}>
                    <b>{p.t}</b>
                    <span className="mono small">{p.v}</span>
                    <p>{p.p}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function RowBar({ name, acc }: { name: string; acc: number }) {
  return (
    <>
      <span>{name}</span>
      <span className="track"><i style={{ width: pct(acc) + '%', background: toneColor(acc >= 0.95 ? 'good' : acc >= 0.9 ? 'warn' : 'bad') }} /></span>
      <span className="m">{pct(acc)}%</span>
    </>
  );
}

