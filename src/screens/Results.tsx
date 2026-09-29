import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { Tab } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { MissMap } from '../components/MissMap';
import { UpdateBanner } from '../components/Toasts';
import { thumbTip, troubleKeys } from '../lib/analysis';
import { ARROW_SCALE, drawMissKeys } from '../lib/draw';
import { confetti, sound } from '../lib/feedback';
import { modeName } from '../lib/game';
import { lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { RoundResult } from '../lib/round';
import { allTaps, type Mode, type Tap } from '../lib/store';
import { reduceMotion, relDate } from '../lib/util';

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (reduceMotion()) {
      el.textContent = Math.round(to) + suffix;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + suffix;
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, suffix]);
  return <span ref={ref} className="num">0</span>;
}

export function Results({ result, past = false, onStart, onClose }: { result: RoundResult; past?: boolean; onStart: (mode: Mode, focus?: string[]) => void; onClose: (then: Tab) => void }) {
  const { sess: s, taps, pbW } = result;
  const acc = s.acc, prec = s.prec || 0;
  const grade = acc >= 0.99 && prec >= 0.6 ? 'Dead center.' : acc >= 0.96 ? 'Sharp.' : acc >= 0.9 ? 'Solid.' : acc >= 0.8 ? 'Getting there.' : 'Wobbly.';
  const byKey: Record<string, Tap[]> = {};
  for (const t of taps) if (t.h !== t.k) (byKey[t.k] ||= []).push(t);
  const missKeys = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const [focus] = useState(() => (missKeys.length ? missKeys.map((m) => m[0]) : troubleKeys(allTaps()).slice(0, 2).map((t) => t.k)));

  const celebrated = useRef(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    let c = 0;
    if (!past && (s.hits === s.n || pbW)) c = window.setTimeout(confetti, 350);
    if (!past && !celebrated.current) {
      celebrated.current = true;
      if (s.hits === s.n || pbW) sound('chime');
    }
    return () => {
      clearTimeout(c);
    };
  }, [past, pbW, s]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawMissKeys(cv, kb, taps, []);
  }, [taps]);

  const [tip] = useState(() => thumbTip(taps, result.caseSlips, prec));
  const slips = [
    result.caseSlips > 0 && `${result.caseSlips} wrong-case letter${result.caseSlips > 1 ? 's' : ''}`,
    result.realigns > 0 && `out of step ${result.realigns}× (not counted)`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="overlay" id="results">
      <div className="app">
        <div className="screen res">
          <div className="res-hero">
            <button className="iconbtn res-close" aria-label="Done" onClick={() => onClose(past ? 'progress' : 'home')}><Icon name="close" /></button>
            <span className="eyebrow">{past ? `${modeName(s)} · ${relDate(s.ts)}` : `${modeName(s)} complete`}</span>
            <h1>{grade}</h1>
          </div>
          <div className="statrow">
            <div className="tile"><span className="eyebrow">Accuracy</span><CountUp to={acc * 100} suffix="%" /></div>
            <div className="tile"><span className="eyebrow">Centered</span><CountUp to={prec * 100} suffix="%" /></div>
            <div className={'tile' + (pbW ? ' best' : '')}><span className="eyebrow">{pbW ? 'Best WPM' : 'WPM'}</span><CountUp to={s.wpm || 0} /></div>
            <div className="tile"><span className="eyebrow">Combo</span><CountUp to={s.combo || 0} /></div>
          </div>
          {missKeys.length ? (
            <section className="card misses">
              <MissMap keys={missKeys} taps={taps} />
              <ArrowLegend misses />
              {slips && <p className="slips">{slips}</p>}
            </section>
          ) : !taps.length ? (
            <section className="card small muted">The tap details for this round are no longer stored; only the most recent 40,000 taps are kept.</section>
          ) : (
            <section className="card mapcard">
              <KeyboardView className="mapwrap" paint={paint}><canvas /></KeyboardView>
              <ArrowLegend />
              <div className="legend">
                {slips ? <span>{slips}</span> : <><span><b>No misses.</b> {result.maxBull >= 5 ? `Best bullseye run: ${result.maxBull}.` : 'Every tap found its key.'}</span></>}
              </div>
            </section>
          )}
          {taps.length > 0 && (
            <section className="card tip">
              <span className="eyebrow">Try this next round</span>
              <p>{tip}</p>
            </section>
          )}
          <div className="btnstack">
            <button className="btn primary block" onClick={() => onStart('round')}><Icon name="play" />{past ? 'Start a round' : 'Next round'}</button>
            <div className="btnrow">
              {focus.length > 0 && <button className="btn gold" onClick={() => onStart('drill', focus)}><Icon name="target" />Drill {focus.map(lab).join(' ')}</button>}
              <button className="btn ghost" onClick={() => onClose('map')}>Tap map</button>
            </div>
            <UpdateBanner inline />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Explains the median arrows on the round's keyboard. */
function ArrowLegend({ misses = false }: { misses?: boolean }) {
  return (
    <div className="legend">
      <span>arrow = median tap, {ARROW_SCALE}× long{misses ? ' · red dot = miss' : ''}</span>
    </div>
  );
}
