import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { Tab } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { MissMap } from '../components/MissMap';
import { ZoneLegend, ZoneMap } from '../components/ZoneMap';
import { UpdateBanner } from '../components/Toasts';
import { ALL, thumbTip, troubleKeys, zoneFindings } from '../lib/analysis';
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

export function Results({ result, past = false, quiet = false, onStart, onClose }: { result: RoundResult; past?: boolean; quiet?: boolean; onStart: (mode: Mode, focus?: string[]) => void; onClose: (then: Tab) => void }) {
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
    if (!past && !quiet && (s.hits === s.n || pbW)) c = window.setTimeout(confetti, 350);
    if (!past && !quiet && !celebrated.current) {
      celebrated.current = true;
      if (s.hits === s.n || pbW) sound('chime');
    }
    return () => {
      clearTimeout(c);
    };
  }, [past, quiet, pbW, s]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawMissKeys(cv, kb, taps, []);
  }, [taps]);

  const [tip] = useState(() => thumbTip(taps, result.caseSlips, prec));
  // Keys (each key's arrow and the worst keys magnified) or Zones (rows by side); the choice carries to later rounds
  const [view, setView] = useState<View>(readView);
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const findings = useMemo(() => topFindings(taps), [taps]);
  const viewSeg = <ViewSeg view={view} onPick={pick} />;
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
          {!taps.length ? (
            <section className="card small muted">The tap details for this round are no longer stored; only the most recent 40,000 taps are kept.</section>
          ) : view === 'zones' ? (
            <section className="card mapcard">
              <ZoneMap taps={taps} />
              <div className="mapfoot"><ZoneLegend />{viewSeg}</div>
              {findings.length > 0 && (
                <div className="zfind">
                  {findings.map((f) => <div key={f.t}><b>{f.t}</b><span className="mono small">{f.v}</span></div>)}
                </div>
              )}
            </section>
          ) : missKeys.length ? (
            <section className="card misses">
              <MissMap keys={missKeys} taps={taps} />
              <div className="mapfoot"><ArrowLegend misses />{viewSeg}</div>
              {slips && <p className="slips">{slips}</p>}
            </section>
          ) : (
            <section className="card mapcard">
              <KeyboardView className="mapwrap" paint={paint}><canvas /></KeyboardView>
              <div className="mapfoot"><ArrowLegend />{viewSeg}</div>
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
type View = 'keys' | 'zones';
const VIEW_KEY = 'dc.resultsView';
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'zones' ? 'zones' : 'keys';
  } catch {
    return 'keys';
  }
}
function ViewSeg({ view, onPick }: { view: View; onPick: (v: View) => void }) {
  return (
    <div className="seg small" role="group" aria-label="Tap map view">
      {(['keys', 'zones'] as const).map((v) => (
        <button key={v} aria-pressed={view === v} onClick={() => onPick(v)}>{v === 'keys' ? 'Keys' : 'Zones'}</button>
      ))}
    </div>
  );
}
/** The round's two biggest trends; the all-clear lines only show when there is nothing else. */
function topFindings(taps: Tap[]) {
  const all = zoneFindings(taps, ALL);
  const real = all.filter((f) => f.m).sort((a, b) => b.m! - a.m!);
  return (real.length ? real : all).slice(0, 2);
}
function ArrowLegend({ misses = false }: { misses?: boolean }) {
  return (
    <div className="legend">
      <span>arrow = median tap, {ARROW_SCALE}× long{misses ? ' · red dot = miss' : ''}</span>
    </div>
  );
}
