import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { KeyboardView } from '../components/KeyboardView';
import type { Tab } from '../components/common';
import { troubleKeys } from '../lib/analysis';
import { lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { Hint, Round } from '../lib/round';
import { allTaps, isGuest, save, store } from '../lib/store';
import { COARSE, pct } from '../lib/util';

const BASE_HINT: Record<string, Hint> = {
  baseline: { tone: 'ok', label: 'Baseline', text: 'Type each line. Misses are logged and you keep going.' },
  drill: { tone: 'warn', label: 'Drill', text: 'Gold dots mark the keys you are training.' },
  round: { tone: 'ok', label: 'Round', text: 'Lines lean toward your weaker keys.' },
};

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
export function Practice({ round: r, home = false, tip, onExit, onSwitch, onNav }: {
  round: Round; home?: boolean; tip?: string; onExit: () => void; onSwitch?: (m: 'round' | 'drill') => void; onNav?: (t: Tab) => void;
}) {
  useSyncExternalStore(r.subscribe, r.getVersion);
  const [soundOn, setSoundOn] = useState(store.S.settings.sound);
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
  const toggleSound = () => {
    store.S.settings.sound = !store.S.settings.sound;
    save();
    setSoundOn(store.S.settings.sound);
  };

  const waiting = home && !r.t0;
  const drillKeys = waiting ? troubleKeys(allTaps()).map((t) => t.k) : [];
  const hint: Hint = waiting && tip ? { tone: 'ok', label: 'Tip', text: tip } : armedAt ? { tone: 'bad', label: 'End round?', text: 'Tap × again to stop. Taps so far are kept.' } : r.hint || BASE_HINT[r.mode];
  const title = r.mode === 'baseline' ? 'Baseline' : r.mode === 'drill' ? `Drill · ${r.focus.map(lab).join(' ')}` : 'Adaptive round';

  return (
    <section className="practice">
      <div className="col">
        {waiting ? (
          <div className="p-top home">
            <div className="seg small" role="group" aria-label="What to type">
              <button aria-pressed={r.mode !== 'drill'} onClick={() => r.mode === 'drill' && onSwitch?.('round')}>Round</button>
              {drillKeys.length > 0 && (
                <button aria-pressed={r.mode === 'drill'} onClick={() => r.mode !== 'drill' && onSwitch?.('drill')}>Drill {drillKeys.map(lab).join(' ')}</button>
              )}
            </div>
            <nav className="p-nav" aria-label="Sections">
              <button className="iconbtn" aria-label="Map" onClick={() => onNav?.('map')}><Icon name="kbd" /></button>
              <button className="iconbtn" aria-label="Progress" onClick={() => onNav?.('progress')}><Icon name="chart" /></button>
              <button className="iconbtn" aria-label="Profile" onClick={() => onNav?.('profile')}><Icon name={isGuest() ? 'guest' : 'person'} /></button>
            </nav>
          </div>
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
        <div className="p-text">
          <div className="p-hint">
            <span className={'pill ' + hint.tone}>{hint.label}</span> {hint.text}
            {!COARSE && !r.hint && !armedAt && <span className="muted"> (Mouse works, but thumbs are what this measures.)</span>}
          </div>
          <Line r={r} />
        </div>
      </div>
      <KeyboardView live className="kbhost" paint={paint} onKey={r.onKey} />
    </section>
  );
}
