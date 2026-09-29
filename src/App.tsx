import { Activity, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionsContext, type Actions, type Tab } from './components/common';
import { KeySheet } from './components/KeySheet';
import { TabBar } from './components/TabBar';
import { Toasts, UpdateBanner } from './components/Toasts';
import { Round, type RoundResult } from './lib/round';
import type { Mode } from './lib/store';
import { Home } from './screens/Home';
import { MapScreen } from './screens/MapScreen';
import { Practice } from './screens/Practice';
import { Progress } from './screens/Progress';
import { Results } from './screens/Results';
import { scroller } from './lib/util';

const ORDER: Tab[] = ['home', 'map', 'progress'];
type Overlay = { kind: 'practice'; round: Round } | { kind: 'results'; result: RoundResult } | null;

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1) as Tab;
    return ORDER.includes(h) ? h : 'home';
  });
  const [dir, setDir] = useState(0);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);

  // each tab keeps its own scroll position, since all three stay mounted
  const scrolls = useRef<Record<string, number>>({});
  const tabRef = useRef(tab);
  const go = useCallback((t: Tab) => {
    setSheetKey(null);
    if (t === tabRef.current) return scroller().scrollTo({ top: 0, behavior: 'smooth' });
    scrolls.current[tabRef.current] = scroller().scrollTop;
    setDir(Math.sign(ORDER.indexOf(t) - ORDER.indexOf(tabRef.current)));
    tabRef.current = t;
    setTab(t);
  }, []);
  useLayoutEffect(() => {
    if (!overlay) scroller().scrollTop = scrolls.current[tab] || 0;
  }, [tab, overlay]);

  const start = useCallback((mode: Mode, focus: string[] = []) => {
    setSheetKey(null);
    if (!overlay) scrolls.current[tabRef.current] = scroller().scrollTop;
    const round = new Round(mode, focus.filter(Boolean), (result) => setOverlay({ kind: 'results', result }));
    setOverlay({ kind: 'practice', round });
  }, [overlay]);
  const actions = useMemo<Actions>(() => ({ go, start, openKey: setSheetKey }), [go, start]);
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
  return (
    <ActionsContext.Provider value={actions}>
      {/* while a round or its results are up, the tabs stay mounted but hidden, and their effects pause */}
      <Activity mode={overlay ? 'hidden' : 'visible'}>
        <div className="app" style={{ '--dx': dir * 18 + 'px' } as React.CSSProperties}>
          <Activity mode={mode('home')}><Home /></Activity>
          <Activity mode={mode('map')}><MapScreen /></Activity>
          <Activity mode={mode('progress')}><Progress /></Activity>
        </div>
        <TabBar tab={tab} onGo={go} />
      </Activity>
      {sheetKey && <KeySheet key={sheetKey} k={sheetKey} onClose={closeSheet} />}
      {overlay?.kind === 'practice' && <Practice key={overlay.round.sid} round={overlay.round} onExit={() => closeOverlay()} />}
      {overlay?.kind === 'results' && <Results key={overlay.result.sess.id} result={overlay.result} onStart={start} onClose={closeOverlay} />}
      <Toasts />
      <UpdateBanner />
    </ActionsContext.Provider>
  );
}
