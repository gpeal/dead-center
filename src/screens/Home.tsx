import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import { Kc, SectionH, Topbar, TrendPill, useActions } from '../components/common';
import { diagnose, keyTrend, troubleKeys } from '../lib/analysis';
import { heroAnim } from '../lib/draw';
import { allTaps, realSessions, storageOK, store, syncState, useStore, isGuest } from '../lib/store';
import { pct } from '../lib/util';
import { lab } from '../lib/keys';

/** The first-run hook. In iPhone Safari (`onContinue`) its button leads to the Add to Home Screen page instead of a round. */
export function Hero({ onContinue }: { onContinue?: () => void }) {
  const { start, go } = useActions();
  const cv = useRef<HTMLCanvasElement>(null);
  // the animation stops while the tab is hidden: Activity unmounts effects and remounts them on return
  useEffect(() => heroAnim(cv.current!), []);
  return (
    <>
      <section className="card hero">
        <h1>
          Improve your typing <em>accuracy</em> and speed
        </h1>
        <div className="hero-stage">
          <canvas ref={cv} />
        </div>
        <p>See exactly where your thumb lands on each key, then drill the ones you miss.{onContinue ? '' : ' The baseline takes about a minute.'}</p>
        {onContinue ? (
          <button className="btn primary block" onClick={onContinue}>Continue</button>
        ) : (
          <>
            <button className="btn primary block" onClick={() => start('baseline')}>
              <Icon name="play" />
              Take the baseline
            </button>
            {!isGuest() && (
              <button className="linkbtn small" style={{ alignSelf: 'center' }} onClick={() => go('map')}>
                Preview with sample data
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Dashboard() {
  const { start, go, openKey } = useActions();
  const S = store.S, rs = realSessions(), taps = allTaps();
  const tk = troubleKeys(taps);
  return (
    <>
      <section className="play">
        <button className="btn primary block" onClick={() => start('round')}>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left' }}>
            Start a round<span className="sub">{S.settings.len} sentences, heavy on your weak letters</span>
          </span>
          <span className="go"><Icon name="play" /></span>
        </button>
        {tk.length > 0 && (
          <button className="drillbtn" onClick={() => start('drill', tk.map((t) => t.k))}>
            <span className="keys">{tk.map((t) => <Kc key={t.k} k={t.k} size="sm" />)}</span>
            <span className="t">Drill your trouble keys<span>Word drills packed with {listKeys(tk.map((t) => t.k))}</span></span>
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

/** "C", "C and H", "C, H and U" */
function listKeys(keys: string[]) {
  const l = keys.map(lab);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}` : l[0];
}
