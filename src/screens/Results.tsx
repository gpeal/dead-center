import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Star } from '../components/Icon';
import { Kc, type Tab } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { troubleKeys } from '../lib/analysis';
import { drawDots } from '../lib/draw';
import { confetti, sound } from '../lib/feedback';
import { modeName } from '../lib/game';
import { lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { RoundResult } from '../lib/round';
import { allTaps, type Mode, type Tap } from '../lib/store';
import { reduceMotion } from '../lib/util';

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

export function Results({ result, onStart, onClose }: { result: RoundResult; onStart: (mode: Mode, focus?: string[]) => void; onClose: (then: Tab) => void }) {
  const { sess: s, taps, pbW } = result;
  const acc = s.acc, prec = s.prec || 0;
  const grade = acc >= 0.99 && prec >= 0.6 ? 'Dead center.' : acc >= 0.96 ? 'Sharp.' : acc >= 0.9 ? 'Solid.' : acc >= 0.8 ? 'Getting there.' : 'Wobbly.';
  const stars = +(acc >= 0.9) + +(acc >= 0.96) + +(acc >= 0.99 || (acc >= 0.975 && prec >= 0.6));
  const byKey: Record<string, Tap[]> = {};
  for (const t of taps) if (t.h !== t.k) (byKey[t.k] ||= []).push(t);
  const missKeys = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  const [focus] = useState(() => (missKeys.length ? missKeys.slice(0, 2).map((m) => m[0]) : troubleKeys(allTaps()).slice(0, 2).map((t) => t.k)));

  const celebrated = useRef(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    let c = 0;
    if (s.hits === s.n || pbW) c = window.setTimeout(confetti, 350);
    if (!celebrated.current) {
      celebrated.current = true;
      if (s.hits === s.n || pbW) sound('chime');
    }
    return () => {
      clearTimeout(c);
    };
  }, [pbW, s]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawDots(cv, kb, taps);
  }, [taps]);

  const slips = [
    result.caseSlips > 0 && `${result.caseSlips} wrong-case letter${result.caseSlips > 1 ? 's' : ''}`,
    result.realigns > 0 && `out of step ${result.realigns}× (not counted)`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="overlay" id="results">
      <div className="app">
        <div className="screen res">
          <div className="res-hero">
            <button className="iconbtn res-close" aria-label="Done" onClick={() => onClose('home')}><Icon name="close" /></button>
            <span className="eyebrow">{modeName(s)} complete</span>
            <h1>{grade}</h1>
            <div className="stars" aria-label={`${stars} of 3`}>{[0, 1, 2].map((i) => <Star key={i} on={i < stars} />)}</div>
          </div>
          <div className="statrow">
            <div className="tile"><span className="eyebrow">Accuracy</span><CountUp to={acc * 100} suffix="%" /></div>
            <div className="tile"><span className="eyebrow">Centered</span><CountUp to={prec * 100} suffix="%" /></div>
            <div className={'tile' + (pbW ? ' best' : '')}><span className="eyebrow">{pbW ? 'Best WPM' : 'WPM'}</span><CountUp to={s.wpm || 0} /></div>
            <div className="tile"><span className="eyebrow">Combo</span><CountUp to={s.combo || 0} /></div>
          </div>
          <section className="card mapcard">
            <KeyboardView className="mapwrap" paint={paint}><canvas /></KeyboardView>
            <div className="legend"><span className="dot" style={{ background: 'var(--green)' }} />hit <span className="dot" style={{ background: 'var(--red)' }} />miss <span>· {taps.length} taps</span></div>
          </section>
          <section className="card notes">
            {missKeys.map(([k, arr]) => {
              const hits: Record<string, number> = {};
              arr.forEach((t) => (hits[t.h] = (hits[t.h] || 0) + 1));
              const topH = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
              const mx = arr.reduce((a, t) => a + t.dx, 0) / arr.length, my = arr.reduce((a, t) => a + t.dy, 0) / arr.length;
              return (
                <div className="note" key={k}>
                  <Kc k={k} size="sm" />
                  <span><b>{arr.length} miss{arr.length > 1 ? 'es' : ''}</b>, mostly onto {lab(topH[0])} <span className="muted">· {shortDir(mx, my)}</span></span>
                </div>
              );
            })}
            {slips && <div className="note"><span className="kc sm" aria-hidden="true">⇆</span><span className="muted">{slips}</span></div>}
            {!missKeys.length && !result.caseSlips && (
              <div className="note"><Star on size={24} /><span><b>No misses.</b> {result.maxBull >= 5 ? `Best bullseye run: ${result.maxBull}.` : 'Every tap found its key.'}</span></div>
            )}
          </section>
          <div className="btnstack">
            <button className="btn primary block" onClick={() => onStart('round')}><Icon name="play" />Next round</button>
            <div className="btnrow">
              {focus.length > 0 && <button className="btn gold" onClick={() => onStart('drill', focus)}><Icon name="target" />Drill {focus.map(lab).join(' ')}</button>}
              <button className="btn ghost" onClick={() => onClose('map')}>Tap map</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// "low left", "high", or "centered": the average direction of the misses
function shortDir(dx: number, dy: number) {
  const p: string[] = [];
  if (Math.abs(dy) >= 0.8) p.push(dy > 0 ? 'low' : 'high');
  if (Math.abs(dx) >= 0.8) p.push(dx > 0 ? 'right' : 'left');
  return p.length ? p.join(' ') : 'centered';
}
