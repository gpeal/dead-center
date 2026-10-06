import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import type { Tab } from '../components/common';
import { MissMap } from '../components/MissMap';
import { StripMap, ZoneMap } from '../components/ZoneMap';
import { UpdateBanner } from '../components/Toasts';
import { ALL, zoneFindings } from '../lib/analysis';
import { drawMissKeys } from '../lib/draw';
import { confetti, sound } from '../lib/feedback';
import { modeName } from '../lib/game';
import type { Kb } from '../lib/keyboard';
import type { RoundResult } from '../lib/round';
import { type Mode, type Tap } from '../lib/store';
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
            {s.mode === 'drill' && !s.wpm ? (
              <div className="tile"><span className="eyebrow">Letters</span><CountUp to={s.n} /></div>
            ) : (
              <div className={'tile' + (pbW ? ' best' : '')}><span className="eyebrow">{pbW ? 'Best WPM' : 'WPM'}</span><CountUp to={s.wpm || 0} /></div>
            )}
            <div className="tile"><span className="eyebrow">Combo</span><CountUp to={s.combo || 0} /></div>
          </div>
          {!taps.length ? (
            <section className="card small muted">The tap details for this round are no longer stored; only the most recent 40,000 taps are kept.</section>
          ) : (
            // every view has the same strip above the keyboard and only the switch below, so switching doesn't shift anything
            <section className="card misses">
              {view === 'zones' ? (
                <ZoneMap taps={taps} strip={<Findings f={findings} />} />
              ) : missKeys.length ? (
                <MissMap keys={missKeys} taps={taps} />
              ) : (
                <StripMap paint={paint} strip={<div className="zfind"><div><b>No misses</b><span className="mono small">{taps.length} taps</span></div></div>} />
              )}
              <div className="mapfoot">{viewSeg}</div>
            </section>
          )}
          <div className="btnstack">
            <button className="btn primary block" onClick={() => onStart('round')}><Icon name="play" />{past ? 'Start a round' : 'Next round'}</button>
            <button className="btn ghost block" onClick={() => onClose('progress')}>Tap map</button>
            <UpdateBanner inline />
          </div>
        </div>
      </div>
    </div>
  );
}

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
/** The round's three biggest trends; the all-clear lines only show when there is nothing else. */
function topFindings(taps: Tap[]) {
  const all = zoneFindings(taps, ALL);
  const real = all.filter((f) => f.m).sort((a, b) => b.m! - a.m!);
  return (real.length ? real : all).slice(0, 3);
}
function Findings({ f }: { f: ReturnType<typeof topFindings> }) {
  if (!f.length) return <div className="zfind"><div><span className="muted">No row or thumb trend this round.</span></div></div>;
  return <div className="zfind">{f.map((x) => <div key={x.t}><b>{x.t}</b><span className="mono small">{x.v}</span></div>)}</div>;
}
