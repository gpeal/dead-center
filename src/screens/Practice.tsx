import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { KeyboardView } from '../components/KeyboardView';
import { UpdateBanner } from '../components/Toasts';
import type { Tab } from '../components/common';
import type { Kb } from '../lib/keyboard';
import type { Hint, Round } from '../lib/round';
import { isGuest, save, store } from '../lib/store';
import { pct } from '../lib/util';

/** The Type tab's top bar before the first tap: the remembered Round / Drill switch and the way to the other screens. */
export function HomeBar({ mode, onSwitch, onNav }: { mode: 'round' | 'drill'; onSwitch?: (m: 'round' | 'drill') => void; onNav?: (t: Tab) => void }) {
  return (
    <div className="p-top home">
      <div className="seg small" role="group" aria-label="What to type">
        {(['round', 'drill'] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => mode !== m && onSwitch?.(m)}>{m === 'round' ? 'Round' : 'Drill'}</button>
        ))}
      </div>
      <nav className="p-nav" aria-label="Sections">
        <button className="iconbtn" aria-label="Progress" onClick={() => onNav?.('progress')}><Icon name="chart" /></button>
        <button className="iconbtn" aria-label="Profile" onClick={() => onNav?.('profile')}><Icon name={isGuest() ? 'guest' : 'person'} /></button>
      </nav>
    </div>
  );
}

/** Practice sound on/off, shared by rounds and drills. */
export function useSoundToggle() {
  const [soundOn, setSoundOn] = useState(store.S.settings.sound);
  const toggle = () => {
    store.S.settings.sound = !store.S.settings.sound;
    save();
    setSoundOn(store.S.settings.sound);
  };
  return [soundOn, toggle] as const;
}

function Line({ r }: { r: Round }) {
  const line = r.line, F = new Set(r.mode === 'drill' ? r.focus : []);
  const words: React.ReactNode[] = [];
  let w: React.ReactNode[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i], up = ch !== ch.toLowerCase(), st = r.state[i], done = i < r.ci;
    const cls = ['c',
      ch === ' ' && 'sp',
      (F.has(ch.toLowerCase()) || (ch === ' ' && F.has('space')) || (up && F.has('shift'))) && 'focus',
      done && 'done', i === r.ci && 'cur',
      done && (st === 'miss' || st === 'case') && 'missed', done && st === 'skip' && 'skipped', done && st === 'fixed' && 'fixed',
      r.shake.i === i && 'shake',
    ].filter(Boolean).join(' ');
    // keying the shaken letter by the shake count restarts its animation on every miss
    const span = <span key={r.shake.i === i ? `${i}-${r.shake.n}` : i} className={cls}>{ch}</span>;
    if (ch === ' ') {
      words.push(<span key={'w' + i} className="w">{w}</span>, span);
      w = [];
    } else w.push(span);
  }
  words.push(<span key="wl" className="w">{w}</span>);
  return <div key={r.li} className="line enter" aria-live="polite">{words}</div>;
}

/**
 * A round. On the Type tab (`home`) it's the home screen: before the first tap the top bar holds the Round / Drill
 * switch and the way to the other screens, and both get out of the way once typing starts.
 */
export function Practice({ round: r, home = false, onExit, onSwitch, onNav }: {
  round: Round; home?: boolean; onExit: () => void; onSwitch?: (m: 'round' | 'drill') => void; onNav?: (t: Tab) => void;
}) {
  useSyncExternalStore(r.subscribe, r.getVersion);
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
  // keep the keyboard's Shift key and letter case in step with the round
  useEffect(() => kbRef.current?.setShift(r.shift));
  const paint = useCallback((kb: Kb) => {
    kbRef.current = kb;
    kb.setShift(r.shift);
  }, [r]);

  const close = () => {
    if (r.taps.length && !r.done && !armedAt) return setArmedAt(Date.now());
    r.abort();
    onExit();
  };

  const waiting = home && !r.t0;
  // only the things you need to act on: the end-round confirm and the realign notice
  const hint: Hint | null = armedAt ? { tone: 'bad', label: 'End round?', text: 'Tap × again to stop. Taps so far are kept.' } : r.hint;
  const title = r.mode === 'baseline' ? 'Baseline' : 'Adaptive round';

  return (
    <section className="practice">
      <div className="col">
        {waiting ? (
          <HomeBar mode="round" onSwitch={onSwitch} onNav={onNav} />
        ) : (
        <div className="p-top">
          <button className="iconbtn" aria-label="End round" onClick={close}><Icon name="close" /></button>
          <div className="title">
            <b>{title}</b>
            <div className="segs">
              {r.lines.map((l, i) => (
                <i key={i} style={{ '--p': i < r.li ? '100%' : i === r.li ? pct(r.ci / l.length) + '%' : '0%' } as React.CSSProperties} />
              ))}
            </div>
          </div>
          <button className="iconbtn" aria-label="Toggle key sounds" aria-pressed={soundOn} onClick={toggleSound}>
            <Icon name={soundOn ? 'soundOn' : 'soundOff'} />
          </button>
        </div>
        )}
        <div className="p-stats">
          <div className="ps"><span className="eyebrow">Accuracy</span><span className="num">{r.scored ? pct(r.good / r.scored) + '%' : '–'}</span></div>
          <div className="ps">
            <span className="eyebrow">Combo</span>
            <span className="num">{r.combo}</span>
          </div>
          <div className="ps">
            <span className="eyebrow">Centered</span>
            <span className="num">{r.precN ? pct(r.precSum / r.precN) + '%' : '–'}</span>
          </div>
        </div>
        {/* the floating update banner hides during rounds, and the Type tab is always a round, so it shows here until the first tap */}
        {waiting && <UpdateBanner inline />}
        <div className="p-text">
          {hint && (
            <div className="p-hint">
              <span className={'pill ' + hint.tone}>{hint.label}</span> {hint.text}
            </div>
          )}
          <Line r={r} />
        </div>
      </div>
      <KeyboardView live className="kbhost" paint={paint} onKey={r.onKey} />
    </section>
  );
}
