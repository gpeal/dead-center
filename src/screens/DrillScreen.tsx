import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { KeyboardView } from '../components/KeyboardView';
import { UpdateBanner } from '../components/Toasts';
import { useScheme, type Tab } from '../components/common';
import { ALL, dirWords, statsFor } from '../lib/analysis';
import { drawScatter } from '../lib/draw';
import { REPS, type Drill } from '../lib/drill';
import { glyph, lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import { pct } from '../lib/util';
import { HomeBar, useSoundToggle } from './Practice';

/** Where this letter's reps landed, on one big key: every tap, the average and its spread. */
function Review({ d }: { d: Drill }) {
  const scheme = useScheme();
  const cv = useRef<HTMLCanvasElement>(null);
  const k = d.key, taps = d.setTaps(k), s = statsFor(taps, k, ALL), hits = taps.filter((t) => t.h === k).length;
  useLayoutEffect(() => {
    if (cv.current) drawScatter(cv.current, k, s, { reach: 1.15, padY: 18 });
  }, [k, taps.length, scheme]);
  const last = d.ki === d.keys.length - 1;
  return (
    <div className="d-review">
      <canvas ref={cv} className="d-scatter" />
      <div className="d-sum">
        <b>{lab(k)} · {hits} of {taps.length}</b>
        <span>{s.n ? dirWords(s.mx, s.my) : ''}</span>
      </div>
      <div className="d-next">Tap space {last ? 'to finish' : `for the next letter`}</div>
    </div>
  );
}

/** The drill: Space, then the letter, REPS times per letter, then a look at where they landed. */
export function DrillScreen({ drill: d, home = false, onExit, onSwitch, onNav }: {
  drill: Drill; home?: boolean; onExit: () => void; onSwitch?: (m: 'round' | 'drill') => void; onNav?: (t: Tab) => void;
}) {
  useSyncExternalStore(d.subscribe, d.getVersion);
  const [soundOn, toggleSound] = useSoundToggle();
  const [armedAt, setArmedAt] = useState(0);
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, []);
  useEffect(() => {
    if (!armedAt) return;
    const t = setTimeout(() => setArmedAt(0), 2500);
    return () => clearTimeout(t);
  }, [armedAt]);
  const paint = useCallback((kb: Kb) => kb.setShift('off'), []);
  const close = () => {
    if (d.taps.length && !d.done && !armedAt) return setArmedAt(Date.now());
    d.abort();
    onExit();
  };

  const waiting = home && !d.t0;
  const letters = d.ki * REPS + d.rep;
  return (
    <section className="practice drill">
      <div className="col">
        {waiting ? (
          <HomeBar mode="drill" onSwitch={onSwitch} onNav={onNav} />
        ) : (
          <div className="p-top">
            <button className="iconbtn" aria-label="End drill" onClick={close}><Icon name="close" /></button>
            <div className="title">
              <b>Drill · {d.keys.map(lab).join(' ')}</b>
              <div className="segs">
                {d.keys.map((k, i) => (
                  <i key={k} style={{ '--p': i < d.ki ? '100%' : i === d.ki ? pct(d.rep / REPS) + '%' : '0%' } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <button className="iconbtn" aria-label="Toggle key sounds" aria-pressed={soundOn} onClick={toggleSound}>
              <Icon name={soundOn ? 'soundOn' : 'soundOff'} />
            </button>
          </div>
        )}
        <div className="p-stats">
          <div className="ps"><span className="eyebrow">Accuracy</span><span className="num">{letters ? pct(d.hits / letters) + '%' : '–'}</span></div>
          <div className="ps"><span className="eyebrow">Combo</span><span className="num">{d.combo}</span></div>
          <div className="ps"><span className="eyebrow">Centered</span><span className="num">{d.hits ? pct(d.precSum / d.hits) + '%' : '–'}</span></div>
        </div>
        {waiting && <UpdateBanner inline />}
        <div className="d-stage">
          {armedAt ? (
            <div className="p-hint"><span className="pill bad">End drill?</span> Tap × again to stop. Taps so far are kept.</div>
          ) : null}
          {d.phase === 'review' ? (
            <Review d={d} />
          ) : (
            <>
              <div className="d-rep">{lab(d.key)} · {Math.min(d.rep + 1, REPS)} of {REPS}</div>
              {d.phase === 'letter' ? (
                <div key={'L' + letters} className="d-cap">{glyph(d.key).toLowerCase()}</div>
              ) : (
                <div key={'S' + letters} className={'d-cap space' + (d.last && d.rep ? (d.last.ok ? ' ok' : ' bad') : '')}>
                  <span>space</span>
                </div>
              )}
              <div className="d-next">{d.phase === 'letter' ? `Tap ${lab(d.key)}` : 'Tap space'}</div>
            </>
          )}
        </div>
      </div>
      <KeyboardView live className="kbhost" paint={paint} onKey={d.onKey} />
    </section>
  );
}
