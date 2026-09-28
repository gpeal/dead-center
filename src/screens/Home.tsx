import { useEffect, useRef } from 'react';
import { Icon, Ring } from '../components/Icon';
import { Kc, SectionH, Topbar, TrendPill, useActions } from '../components/common';
import { diagnose, keyTrend, troubleKeys } from '../lib/analysis';
import { heroAnim } from '../lib/draw';
import { levelInfo } from '../lib/game';
import { allTaps, realSessions, storageOK, store, syncState, useStore } from '../lib/store';
import { COARSE, IN_FRAME, pct, today } from '../lib/util';

function Hero() {
  const { start, go } = useActions();
  const cv = useRef<HTMLCanvasElement>(null);
  // the animation stops while the tab is hidden: Activity unmounts effects and remounts them on return
  useEffect(() => heroAnim(cv.current!), []);
  return (
    <>
      <section className="card hero">
        <h1>
          Where does your thumb <em>really</em> land?
        </h1>
        <div className="hero-stage">
          <canvas ref={cv} />
        </div>
        <p>See exactly where each tap lands on a true-size iPhone keyboard, then drill the keys you miss.</p>
        <ol className="steps">
          <li><div><b>Take the baseline</b> <span>· about a minute</span></div></li>
          <li><div><b>Read your tap map</b></div></li>
          <li><div><b>Drill your weak keys</b></div></li>
        </ol>
        <button className="btn primary block" onClick={() => start('baseline')}>
          <Icon name="play" />
          Take the baseline
        </button>
        <button className="linkbtn small" style={{ alignSelf: 'center' }} onClick={() => go('map')}>
          Preview with sample data
        </button>
      </section>
      {!COARSE && <p className="foot">Built for iPhone. Open it on your phone to measure your thumbs.</p>}
    </>
  );
}

function Dashboard() {
  const { start, go, openKey } = useActions();
  const S = store.S, lv = levelInfo(S.xp), rs = realSessions(), taps = allTaps();
  const tk = troubleKeys(taps);
  const dr = S.daily.day === today() ? S.daily.rounds : 0, goal = 3;
  return (
    <>
      <section className="card level">
        <div className="rank">
          <span className="eyebrow">Level {lv.lvl}</span>
          <h1>{lv.rank}</h1>
        </div>
        <div className="goal" aria-label={`${Math.min(dr, goal)} of ${goal} rounds today`}>
          <Ring v={dr / goal} color="var(--gold)" size={68} sw={7} />
          <div className="lbl">
            <div>
              <b>{Math.min(dr, goal)}/{goal}</b>
              <span>today</span>
            </div>
          </div>
        </div>
        <div className="xpbar">
          <div className="bar"><i style={{ width: pct(lv.into / lv.need) + '%' }} /></div>
          <div className="xpmeta">
            <span>{lv.into} / {lv.need} XP</span>
            <span>{lv.need - lv.into} to level {lv.lvl + 1}</span>
          </div>
        </div>
      </section>
      <section className="play">
        <button className="btn primary block" onClick={() => start('round')}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            Start a round<span className="sub">{S.settings.len} lines, weighted to your weak keys</span>
          </span>
          <span className="go"><Icon name="play" /></span>
        </button>
        {tk.length > 0 && (
          <button className="drillbtn" onClick={() => start('drill', tk.map((t) => t.k))}>
            <span className="keys">{tk.map((t) => <Kc key={t.k} k={t.k} size="sm" />)}</span>
            <span className="t">Drill your trouble keys<span>Lines built from your own misses</span></span>
            <Icon name="chev" />
          </button>
        )}
        {!rs.some((s) => s.mode === 'baseline') && (
          <button className="drillbtn" onClick={() => start('baseline')}>
            <span className="keys"><Kc k="a" size="sm" /><Kc k="z" size="sm" /></span>
            <span className="t">Take the baseline<span>Covers every letter so the map is complete</span></span>
            <Icon name="chev" />
          </button>
        )}
      </section>
      <SectionH title="Fix these next">
        <button className="eyebrow" onClick={() => go('map')}>Full map ›</button>
      </SectionH>
      {tk.length ? (
        <div className="klist">
          {tk.map(({ k, s }) => {
            const dg = diagnose(s);
            return (
              <button key={k} className="krow" onClick={() => openKey(k)}>
                <Kc k={k} />
                <span className="d"><b>{dg.headline}</b><span>{dg.short}</span></span>
                <span className="v"><span className="num">{pct(s.acc)}%</span><TrendPill tr={keyTrend(taps, k)} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="card small muted">{taps.length < 150 ? 'A couple more rounds and your weakest keys show up here.' : 'Every key is above 97%. Rounds keep testing the harder ones.'}</div>
      )}
      {!IN_FRAME && /iPhone|iPad/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && (
        <div className="card small"><b>Install it:</b> <span className="muted">Share, then Add to Home Screen.</span></div>
      )}
    </>
  );
}

export function Home() {
  useStore();
  const rs = realSessions();
  return (
    <main className="screen">
      <Topbar />
      {!storageOK && <div className="warnbar">This browser is blocking storage, so progress will reset when you close the page.</div>}
      {!rs.length && syncState() === 'loading' ? (
        <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="brand"><Icon name="logo" /></span>
          <div><b>Loading your progress…</b><div className="small muted">Fetching your rounds from your account.</div></div>
        </section>
      ) : !rs.length ? (
        <Hero />
      ) : (
        <Dashboard />
      )}
    </main>
  );
}
