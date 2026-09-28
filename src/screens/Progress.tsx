import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Ring } from '../components/Icon';
import { LineChart, SectionH, Topbar, useActions } from '../components/common';
import { masteryLabel, statsFor, toneColor } from '../lib/analysis';
import { buzz, toast } from '../lib/feedback';
import { ACH, modeName } from '../lib/game';
import { glyph, lab, TRAINABLE } from '../lib/keys';
import { dataset, fresh, hydrate, replaceState, save, store, syncText, useStore, type Settings } from '../lib/store';
import { pct, relDate } from '../lib/util';

const dateLabel = (ts: number) => relDate(ts).replace(/ \d.*$/, '');

function Charts({ sessions }: { sessions: ReturnType<typeof dataset>['sessions'] }) {
  const last = sessions.slice(-30);
  const lo = Math.min(0.7, ...last.map((s) => Math.min(s.acc, s.prec || 1)));
  const yMin = Math.floor(lo * 10) / 10;
  const top = Math.ceil(Math.max(20, ...last.map((s) => s.wpm || 0)) / 10) * 10;
  return (
    <>
      <section className="card chartcard">
        <div className="hd">
          <span className="eyebrow">By round</span>
          <span className="legend" style={{ padding: 0 }}>
            <span className="dot" style={{ background: 'var(--accent)' }} />accuracy <span className="dot" style={{ background: 'var(--gold)' }} />centered
          </span>
        </div>
        <LineChart
          series={[{ values: last.map((s) => s.acc), color: 'var(--accent)', label: 'Accuracy' }, { values: last.map((s) => s.prec || 0), color: 'var(--gold)', label: 'Centered', w: 2 }]}
          yMin={yMin} yMax={1} ticks={[yMin, (yMin + 1) / 2, 1].map((v) => Math.round(v * 100) / 100)} fmt={(v) => Math.round(v * 100) + '%'} xLabel={(i) => dateLabel(last[i].ts)}
        />
      </section>
      <section className="card chartcard">
        <div className="hd">
          <span className="eyebrow">Speed</span>
          <span className="legend" style={{ padding: 0 }}>wpm</span>
        </div>
        <LineChart series={[{ values: last.map((s) => s.wpm || 0), color: 'var(--green)', label: 'Speed' }]} yMin={0} yMax={top} ticks={[0, top / 2, top]} fmt={(v) => String(Math.round(v))} height={130} xLabel={(i) => dateLabel(last[i].ts)} />
      </section>
    </>
  );
}

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
      <div className="set"><div className="t"><b>Progress</b><span>{syncText()}</span></div></div>
      <div className="set">
        <div className="t"><b>Round length</b><span>Lines per round</span></div>
        <div className="seg small" role="group" aria-label="Round length">
          {([[2, 'Short'], [3, 'Normal'], [5, 'Long']] as const).map(([v, l]) => (
            <button key={v} aria-pressed={S.settings.len === v} onClick={() => setLen(v)}>{l}</button>
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
        <div className="t"><b>Erase everything</b><span>All taps, rounds and XP</span></div>
        <button className="danger" onClick={erase}>{armed ? 'Tap again to erase' : 'Erase'}</button>
      </div>
    </section>
  );
}

export function Progress() {
  const version = useStore();
  const { openKey } = useActions();
  const ds = useMemo(() => dataset(), [version]);
  const { taps: t, sessions: rs } = ds;
  const hits = t.filter((x) => x.h === x.k).length;
  const bestW = Math.max(0, ...rs.map((s) => s.wpm || 0));
  const mastery = useMemo(() => TRAINABLE.map((k) => ({ k, s: statsFor(t, k, 80) })), [t]);
  return (
    <main className="screen">
      <Topbar />
      <SectionH title="Progress">{ds.sample && <span className="pill sample">Sample data</span>}</SectionH>
      <div className="tiles">
        <div className="tile"><span className="eyebrow">Rounds</span><span className="num">{rs.length}</span></div>
        <div className="tile"><span className="eyebrow">Taps</span><span className="num">{t.length.toLocaleString()}</span></div>
        <div className="tile"><span className="eyebrow">Accuracy</span><span className="num">{t.length ? pct(hits / t.length) : 0}<small>%</small></span></div>
        <div className="tile"><span className="eyebrow">Best speed</span><span className="num">{Math.round(bestW)}<small>wpm</small></span></div>
      </div>
      <Charts sessions={rs} />
      {!ds.sample && (
        <>
          <SectionH title="Recent rounds"><span className="eyebrow">{rs.length} total</span></SectionH>
          <section className="card" style={{ paddingBlock: 10 }}>
            <div className="rounds">
              <div className="rrow rhead"><span>Round</span><span className="m">Acc</span><span className="m">WPM</span><span className="m">Score</span></div>
              {rs.slice(-5).reverse().map((s) => (
                <div className="rrow" key={s.id}>
                  <span className="n"><b>{modeName(s)}</b><span>{relDate(s.ts)}</span></span>
                  <span className="m">{pct(s.acc)}%</span>
                  <span className="m">{Math.round(s.wpm || 0)}</span>
                  <span className="m">{s.score}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <SectionH title="Key mastery"><span className="eyebrow">Tap a key</span></SectionH>
      <section className="card">
        <div className="keys-mastery">
          {mastery.map(({ k, s }) => (
            <button key={k} className="km" aria-label={`${lab(k)} mastery ${s.n ? s.mastery : 'no data'}`} onClick={() => openKey(k)}>
              <span className="ring">
                <Ring v={s.n ? s.mastery / 100 : 0} color={s.n ? toneColor(masteryLabel(s.mastery)[1]) : 'var(--line)'} />
                <b>{glyph(k)}</b>
              </span>
              {s.n ? s.mastery : '–'}
            </button>
          ))}
        </div>
      </section>
      <SectionH title="Achievements"><span className="eyebrow">{Object.keys(store.S.ach).length} of {ACH.length}</span></SectionH>
      <div className="ach">
        {ACH.map((a) => (
          <div key={a.id} className={'badge' + (store.S.ach[a.id] ? '' : ' locked')}>
            <span className="ic"><Icon name={a.ic} /></span>
            <div><b>{a.name}</b><span>{a.desc}</span></div>
          </div>
        ))}
      </div>
      <SectionH title="Settings" id="settings" />
      <SettingsCard />
      <p className="foot">Scores raw aim. The real iOS keyboard enlarges likely keys, so everyday typing is more forgiving.</p>
    </main>
  );
}
