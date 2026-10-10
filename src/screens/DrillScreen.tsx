import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { KeyboardView } from '../components/KeyboardView';
import { UpdateBanner } from '../components/Toasts';
import { useScheme, type Tab } from '../components/common';
import { drawDrill } from '../lib/draw';
import { GOAL, GOLD, MAX, WINDOW, type Drill } from '../lib/drill';
import { lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import { pct } from '../lib/util';
import { HomeBar, useSoundToggle } from './Practice';

/** The drill: the target is lit on the keyboard and every tap stays there as a dot until the goal is met. */
export function DrillScreen({ drill: d, home = false, onExit, onSwitch, onNav }: {
  drill: Drill; home?: boolean; onExit: () => void; onSwitch?: (m: 'round' | 'drill') => void; onNav?: (t: Tab) => void;
}) {
  const v = useSyncExternalStore(d.subscribe, d.getVersion);
  const scheme = useScheme();
  const [soundOn, toggleSound] = useSoundToggle();
  const [armedAt, setArmedAt] = useState(0);
  const kbRef = useRef<Kb | null>(null);
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
  const draw = useCallback(() => {
    const kb = kbRef.current, cv = kb?.el.parentElement?.querySelector<HTMLCanvasElement>('canvas.drillfx');
    if (kb && cv && !d.done) drawDrill(cv, kb, d.key, d.cleared ? d.key : d.next, d.setTaps(), GOLD);
  }, [d]);
  const paint = useCallback((kb: Kb) => {
    kbRef.current = kb;
    kb.setShift('off');
    draw();
  }, [draw]);
  useEffect(draw, [v, scheme, draw]);
  const close = () => {
    if (d.taps.length && !d.done && !armedAt) return setArmedAt(Date.now());
    d.abort();
    onExit();
  };

  const waiting = home && !d.t0;
  const last = d.marks.slice(-WINDOW);
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
                  <i key={k} style={{ '--p': i < d.ki || (i === d.ki && d.cleared) ? '100%' : i === d.ki ? pct(d.inWindow / GOAL) + '%' : '0%' } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <button className="iconbtn" aria-label="Toggle key sounds" aria-pressed={soundOn} onClick={toggleSound}>
              <Icon name={soundOn ? 'soundOn' : 'soundOff'} />
            </button>
          </div>
        )}
        <div className="p-stats">
          <div className="ps"><span className="eyebrow">Accuracy</span><span className="num">{d.n ? pct(d.hits / d.n) + '%' : '–'}</span></div>
          <div className="ps"><span className="eyebrow">In the gold</span><span className="num">{d.inWindow}<small> / {GOAL}</small></span></div>
          <div className="ps"><span className="eyebrow">Centered</span><span className="num">{d.hits ? pct(d.precSum / d.hits) + '%' : '–'}</span></div>
        </div>
        {waiting && <UpdateBanner inline />}
        <div className="d-stage">
          {armedAt ? <div className="p-hint"><span className="pill bad">End drill?</span> Tap × again to stop. Taps so far are kept.</div> : null}
          <div className="d-meter" aria-label={`${d.inWindow} of your last ${WINDOW} ${lab(d.key)} taps in the gold zone`}>
            {Array.from({ length: WINDOW }, (_, i) => <i key={i} className={last[i] || ''} />)}
          </div>
          {d.cleared ? (
            <div className="d-seq done"><b>{lab(d.key)}</b> <Icon name="check" /></div>
          ) : (
            <div className="d-row">
              <div className={'d-seq' + (d.slipped ? ' shook' : '')} key={d.reps + ':' + d.shake}>
                {d.seq.map((ch, i) => (
                  <span key={i} className={(ch === d.key ? 't' : '') + (i === d.si ? ' cur' : '') + (i < d.si ? ' past' : '')}>{ch === 'space' ? '␣' : ch}</span>
                ))}
              </div>
              <div className="d-up" aria-hidden="true">{d.upcoming.map((ch) => (ch === 'space' ? '␣' : ch)).join('')}</div>
            </div>
          )}
          <div className="d-next">
            {d.cleared
              ? d.after ? <>Next: <b>{lab(d.after.key)}</b>{d.after.lead !== 'space' ? <> after <b>{lab(d.after.lead)}</b></> : null}</> : 'Done'
              : `Land ${GOAL} of ${WINDOW} ${lab(d.key)} taps in the gold · ${Math.max(0, MAX - d.marks.length)} left`}
          </div>
        </div>
      </div>
      <KeyboardView live className="kbhost" paint={paint} onKey={d.onKey}><canvas className="drillfx" /></KeyboardView>
    </section>
  );
}
