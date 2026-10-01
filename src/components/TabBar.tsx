import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import type { Tab } from './common';
import { isGuest, useStore } from '../lib/store';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Today', icon: 'target' },
  { id: 'map', label: 'Map', icon: 'kbd' },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'profile', label: 'Profile', icon: 'person' },
];
// must match .tab padding, icon size and gap, and .tabbar .in gap in styles.css
const PAD = 14, ICON = 20, GAP = 7, SEP = 4;

const isTextField = (e: EventTarget | null) => e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button'].includes(e.type));

/** True while a text field has focus, when iOS shows its keyboard and would float the fixed bar above it. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const sync = () => setTyping(isTextField(document.activeElement));
    const later = () => setTimeout(sync); // activeElement is still the old field during focusout
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', later);
    return () => { document.removeEventListener('focusin', sync); document.removeEventListener('focusout', later); };
  }, []);
  return typing;
}

/**
 * Every tab gets an explicit width (icon only, or icon plus label for the current one), and the highlight's
 * position is the sum of the widths before it. Both animate on the same curve, so the highlight tracks the
 * tabs exactly while the old label folds away and the new one opens.
 */
export function TabBar({ tab, onGo }: { tab: Tab; onGo: (t: Tab) => void }) {
  useStore(); // the Profile icon changes in guest mode
  const typing = useTyping();
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [lw, setLw] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const measure = () => setLw(labels.current.map((e) => (e ? Math.ceil(e.getBoundingClientRect().width) : 0)));
    measure();
    document.fonts?.ready.then(measure);
  }, []);
  const ai = TABS.findIndex((t) => t.id === tab);
  // counts tab switches (not the first render) so the highlight's squish replays on each one
  const [switches, setSwitches] = useState(-1);
  const prevTab = useRef(tab);
  useLayoutEffect(() => {
    if (prevTab.current !== tab) setSwitches((n) => n + 1);
    prevTab.current = tab;
  }, [tab]);
  const widths = TABS.map((_, i) => PAD * 2 + ICON + (lw && i === ai ? GAP + lw[i] : 0));
  const x = widths.slice(0, ai).reduce((a, w) => a + w + SEP, 0);
  return (
    <nav className={'tabbar' + (lw ? ' ready' : '') + (typing ? ' typing' : '')} aria-label="Sections">
      <div className="in glass">
        {lw && <span className="tab-ind" aria-hidden="true" data-flip={switches < 0 ? undefined : switches % 2} style={{ width: widths[ai], transform: `translateX(${x}px)` }} />}
        {TABS.map((t, i) => (
          <button key={t.id} className="tab" aria-label={t.label} aria-current={t.id === tab ? 'page' : 'false'} style={lw ? { width: widths[i] } : undefined} onClick={() => onGo(t.id)}>
            <Icon name={t.id === 'profile' && isGuest() ? 'guest' : t.icon} />
            <span className="l">{t.label}</span>
          </button>
        ))}
        <span className="tab-measure" aria-hidden="true">
          {TABS.map((t, i) => <span key={t.id} ref={(e) => { labels.current[i] = e; }}>{t.label}</span>)}
        </span>
      </div>
    </nav>
  );
}
