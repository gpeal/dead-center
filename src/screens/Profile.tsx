import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SectionH, Topbar, useActions } from '../components/common';
import { buzz, toast } from '../lib/feedback';
import { fresh, hydrate, isGuest, realSessions, replaceState, save, setGuest, store, useStore, type Settings } from '../lib/store';

function Switch({ id, label }: { id: 'sound' | 'haptics'; label: string }) {
  const on = store.S.settings[id];
  return (
    <button className="switch" role="switch" aria-label={label} aria-checked={on} onClick={() => {
      store.S.settings[id] = !on;
      save();
      if (id === 'haptics' && !on) buzz();
    }} />
  );
}

function SettingsCard() {
  const { go } = useActions();
  const S = store.S;
  const ta = useRef<HTMLTextAreaElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const setLen = (len: Settings['len']) => {
    S.settings.len = len;
    save();
  };
  const backup = () => {
    const txt = JSON.stringify(S);
    const fallback = () => {
      ta.current!.value = txt;
      ta.current!.focus();
      ta.current!.select();
      toast('copy', 'Backup is in the box below', 'Select all and copy it');
    };
    try {
      navigator.clipboard.writeText(txt).then(() => toast('copy', 'Backup copied', 'Paste it into Restore on another device'), fallback);
    } catch {
      fallback();
    }
  };
  const restore = () => {
    try {
      const o = JSON.parse(ta.current!.value);
      if (!Array.isArray(o.taps) || !Array.isArray(o.sessions)) throw 0;
      replaceState(hydrate(o));
      ta.current!.value = '';
      toast('check', 'Backup restored', `${o.sessions.length} rounds, ${o.taps.length.toLocaleString()} taps`);
    } catch {
      toast('close', 'That backup could not be read', 'Paste the full text from Copy backup');
    }
  };
  const erase = () => {
    if (!armed) return setArmed(true);
    setArmed(false);
    replaceState(fresh());
    toast('check', 'Everything erased', 'Start fresh with the baseline');
    go('home');
  };
  return (
    <section className="card settings">
      <div className="set"><div className="t"><b>Key clicks</b><span>Click on tap, thud on miss</span></div><Switch id="sound" label="Key clicks" /></div>
      <div className="set"><div className="t"><b>Haptics</b><span>Where supported</span></div><Switch id="haptics" label="Haptics" /></div>
      <div className="set">
        <div className="t"><b>Round length</b><span>Lines per round</span></div>
        <div className="seg small" role="group" aria-label="Round length">
          {([[2, 'Short'], [3, 'Normal'], [5, 'Long']] as const).map(([v, l]) => (
            <button key={v} aria-pressed={S.settings.len === v} onClick={() => setLen(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="set">
        <div className="t"><b>Recent window</b><span>Half-life, taps per key</span></div>
        <div className="seg small" role="group" aria-label="Recent window">
          {([15, 30, 60] as const).map((v) => (
            <button key={v} aria-pressed={(S.settings.half || 30) === v} onClick={() => { S.settings.half = v; save(); }}>{v}</button>
          ))}
        </div>
      </div>
      <div className="set">
        <div className="t"><b>Backup</b><span>Move data to another browser</span></div>
        <button className="btn ghost" style={{ height: 36, fontSize: 13, paddingInline: 12 }} onClick={backup}><Icon name="copy" />Copy</button>
      </div>
      <div className="set" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="t"><b>Restore</b><span>Paste a backup below</span></div>
        <textarea ref={ta} className="backup" placeholder="Paste backup JSON" />
        <button className="btn ghost" style={{ height: 40, fontSize: 14 }} onClick={restore}>Restore from backup</button>
      </div>
      <div className="set">
        <div className="t"><b>Erase everything</b><span>All taps and rounds</span></div>
        <button className="danger" onClick={erase}>{armed ? 'Tap again to erase' : 'Erase'}</button>
      </div>
    </section>
  );
}

/** Guest mode: let someone else play without touching your rounds. Turning it off deletes the guest's rounds. */
function GuestCard() {
  const on = isGuest();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  const toggle = () => {
    if (on && realSessions().length && !armed) return setArmed(true); // confirm before deleting the guest's rounds
    setArmed(false);
    setGuest(!on);
    toast(on ? 'check' : 'target', on ? 'Back to your profile' : 'Guest mode on', on ? "The guest's rounds were deleted" : 'Rounds now go to a temporary guest profile');
  };
  return (
    <section className="card settings">
      <div className="set">
        <div className="t">
          <b>Guest mode</b>
          <span>{on ? (armed ? "Tap again: the guest's rounds will be deleted" : 'On: rounds go to a temporary guest profile') : 'Let someone else play without touching your stats'}</span>
        </div>
        <button className="switch" role="switch" aria-label="Guest mode" aria-checked={on} onClick={toggle} />
      </div>
    </section>
  );
}

export function Profile() {
  useStore();
  return (
    <main className="screen">
      <Topbar />
      <SectionH title="Profile" />
      <GuestCard />
      <SectionH title="Settings" id="settings" />
      <SettingsCard />
    </main>
  );
}
