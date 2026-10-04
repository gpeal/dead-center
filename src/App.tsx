import { Activity, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionsContext, Topbar, type Actions, type Tab } from './components/common';
import { InstallLanding } from './components/InstallLanding';
import { KeySheet } from './components/KeySheet';
import { needsInstall } from './lib/install';
import { TabBar } from './components/TabBar';
import { Toasts, UpdateBanner } from './components/Toasts';
import { pastResult, Round, type RoundResult } from './lib/round';
import { thumbTip, troubleKeys } from './lib/analysis';
import { allTaps, realSessions, save, store, useStore, type Mode } from './lib/store';
import { Hero, Home } from './screens/Home';
import { Practice } from './screens/Practice';
import { Profile } from './screens/Profile';
import { Progress } from './screens/Progress';
import { Results } from './screens/Results';

const ORDER: Tab[] = ['home', 'progress', 'profile'];
// past: a saved round reopened from Progress, which returns there when closed; quiet: reopened by a reload, so no confetti
// home: the round waiting on the Type tab, which opens straight into typing once the baseline is done
type Overlay = { kind: 'practice'; round: Round; home?: boolean; tip?: string } | { kind: 'results'; result: RoundResult; past?: boolean; quiet?: boolean; home?: boolean } | null;

// The current tab (#map, #progress, #profile) and the results screen (#results-<id>, or #round-<id> for one reopened
// from Progress) are kept in the URL, so a reload, including the update banner's Reload button, lands back there.
const RESULTS_HASH = /^#(results|round)-(\d+)$/;
function overlayFromHash(): Overlay {
  const m = RESULTS_HASH.exec(location.hash);
  const sess = m && realSessions().find((s) => s.id === +m[2]);
  return sess ? { kind: 'results', result: pastResult(sess), past: m[1] === 'round', quiet: true } : null;
}

/** The Type tab's round: the remembered Round / Drill choice, drilling the current trouble keys. */
function homePlay(): [Mode, string[]] {
  const keys = troubleKeys(allTaps()).map((t) => t.k);
  return store.S.settings.play === 'drill' && keys.length ? ['drill', keys] : ['round', []];
}
/** The last finished round's tip, shown on the Type tab until the first tap. */
function lastTip() {
  const last = realSessions().at(-1);
  if (!last) return undefined;
  const taps = allTaps().filter((t) => t.sid === last.id);
  return taps.length ? thumbTip(taps, last.caseSlips || 0, last.prec || 0) : undefined;
}

export function App() {
  const version = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1) as Tab;
    if (location.hash.startsWith('#round-')) return 'progress';
    return ORDER.includes(h) ? h : 'home';
  });
  const [dir, setDir] = useState(0);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(overlayFromHash);
  // in iPhone Safari the app is replaced by the Add to Home Screen page; it only runs from the Home Screen there
  const [gated] = useState(needsInstall);
  // in Safari the hook shows first; its Continue button leads to the Add to Home Screen page
  const [gateShown, setGateShown] = useState(false);
  useEffect(() => {
    const url = location.pathname + location.search;
    if (overlay?.kind === 'results') history.replaceState(null, '', `${url}#${overlay.past ? 'round' : 'results'}-${overlay.result.sess.id}`);
    else history.replaceState(null, '', tab === 'home' ? url : `${url}#${tab}`);
  }, [overlay, tab]);

  // each tab keeps its own scroll position, since all three stay mounted
  const scrolls = useRef<Record<string, number>>({});
  const tabRef = useRef(tab);
  const go = useCallback((t: Tab) => {
    setSheetKey(null);
    if (t === tabRef.current) return window.scrollTo({ top: 0, behavior: 'smooth' });
    scrolls.current[tabRef.current] = window.scrollY;
    setDir(Math.sign(ORDER.indexOf(t) - ORDER.indexOf(tabRef.current)));
    tabRef.current = t;
    setTab(t);
  }, []);
  useLayoutEffect(() => {
    if (!overlay) window.scrollTo(0, scrolls.current[tab] || 0);
  }, [tab, overlay]);

  const start = useCallback((mode: Mode, focus: string[] = []) => {
    setSheetKey(null);
    if (!overlay) scrolls.current[tabRef.current] = window.scrollY;
    // rounds started from the Type tab (including Next round on its results) keep the Type tab's controls
    const home = !gated && tabRef.current === 'home' && realSessions().length > 0;
    const round = new Round(mode, focus.filter(Boolean), (result) => setOverlay({ kind: 'results', result, home }));
    setOverlay({ kind: 'practice', round, home, tip: home ? lastTip() : undefined });
  }, [overlay, gated]);
  // the Type tab is the typing screen itself: whenever it's showing with nothing on top, a round is waiting
  useLayoutEffect(() => {
    if (!gated && !overlay && !sheetKey && tab === 'home' && realSessions().length) start(...homePlay());
  }, [gated, overlay, sheetKey, tab, version, start]);
  const switchPlay = useCallback((m: 'round' | 'drill') => {
    if (overlay?.kind === 'practice') overlay.round.abort();
    store.S.settings.play = m;
    save();
    setOverlay(null); // the effect above starts the new round
  }, [overlay]);
  const navFromType = useCallback((t: Tab) => {
    if (overlay?.kind === 'practice') overlay.round.abort();
    setOverlay(null);
    go(t);
  }, [overlay, go]);
  const openRound = useCallback((id: number) => {
    const sess = realSessions().find((s) => s.id === id);
    if (!sess) return;
    setSheetKey(null);
    scrolls.current[tabRef.current] = window.scrollY;
    setOverlay({ kind: 'results', result: pastResult(sess), past: true });
  }, []);
  const actions = useMemo<Actions>(() => ({ go, start, openKey: setSheetKey, openRound }), [go, start, openRound]);
  const closeSheet = useCallback(() => setSheetKey(null), []);
  const closeOverlay = useCallback((then?: Tab) => {
    setOverlay(null);
    if (then && then !== tabRef.current) {
      tabRef.current = then;
      setDir(0);
      setTab(then);
      scrolls.current[then] = 0;
    }
  }, []);

  const mode = (t: Tab) => (tab === t ? 'visible' : 'hidden');
  if (gated)
    return (
      <ActionsContext.Provider value={actions}>
        {gateShown ? (
          <InstallLanding />
        ) : (
          <div className="app">
            <main className="screen">
              <Topbar />
              <Hero onContinue={() => setGateShown(true)} />
            </main>
          </div>
        )}
        <Toasts />
      </ActionsContext.Provider>
    );
  return (
    <ActionsContext.Provider value={actions}>
      {/* while a round or its results are up, the tabs stay mounted but hidden, and their effects pause */}
      <Activity mode={overlay ? 'hidden' : 'visible'}>
        <div className="app" style={{ '--dx': dir * 18 + 'px' } as React.CSSProperties}>
          <Activity mode={mode('home')}><Home /></Activity>
          <Activity mode={mode('progress')}><Progress /></Activity>
          <Activity mode={mode('profile')}><Profile /></Activity>
        </div>
        <TabBar tab={tab} onGo={go} />
      </Activity>
      {sheetKey && <KeySheet key={sheetKey} k={sheetKey} onClose={closeSheet} />}
      {overlay?.kind === 'practice' && <Practice key={overlay.round.sid} round={overlay.round} home={overlay.home} tip={overlay.tip} onExit={() => closeOverlay()} onSwitch={switchPlay} onNav={navFromType} />}
      {overlay?.kind === 'results' && <Results key={overlay.result.sess.id} result={overlay.result} past={overlay.past} quiet={overlay.quiet} onStart={(m, f) => (overlay.home && m === 'round' ? start(...homePlay()) : start(m, f))} onClose={closeOverlay} />}
      <Toasts />
      <UpdateBanner />
    </ActionsContext.Provider>
  );
}
