import { useMemo } from 'react';
import { Icon, Ring } from '../components/Icon';
import { LineChart, SectionH, Topbar, useActions } from '../components/common';
import { masteryLabel, statsFor, toneColor } from '../lib/analysis';
import { modeName } from '../lib/game';
import { glyph, lab, TRAINABLE } from '../lib/keys';
import { dataset, useStore } from '../lib/store';
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
          yMin={yMin} yMax={1} ticks={[yMin, (yMin + 1) / 2, 1].map((v) => Math.round(v * 100) / 100)} fmt={(v) => Math.round(v * 100) + '%'} xLabel={(i) => dateLabel(last[i].ts)} pointLabel={(i) => relDate(last[i].ts)}
        />
      </section>
      <section className="card chartcard">
        <div className="hd">
          <span className="eyebrow">Speed</span>
          <span className="legend" style={{ padding: 0 }}>wpm</span>
        </div>
        <LineChart series={[{ values: last.map((s) => s.wpm || 0), color: 'var(--green)', label: 'Speed' }]} yMin={0} yMax={top} ticks={[0, top / 2, top]} fmt={(v) => String(Math.round(v))} height={130} xLabel={(i) => dateLabel(last[i].ts)} pointLabel={(i) => relDate(last[i].ts)} tipFmt={(v) => Math.round(v) + ' wpm'} />
      </section>
    </>
  );
}

export function Progress() {
  const version = useStore();
  const { openKey, openRound } = useActions();
  const ds = useMemo(() => dataset(), [version]);
  const { taps: t, sessions: rs } = ds;
  const hits = t.filter((x) => x.h === x.k).length;
  const bestW = Math.max(0, ...rs.map((s) => s.wpm || 0));
  const mastery = useMemo(() => TRAINABLE.map((k) => ({ k, s: statsFor(t, k) })), [t]);
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
              <div className="rrow rhead"><span>Round</span><span className="m">Acc</span><span className="m">WPM</span><span /></div>
              {rs.slice(-5).reverse().map((s) => (
                <button className="rrow" key={s.id} onClick={() => openRound(s.id)} aria-label={`${modeName(s)}, ${relDate(s.ts)}. Open summary`}>
                  <span className="n"><b>{modeName(s)}</b><span>{relDate(s.ts)}</span></span>
                  <span className="m">{pct(s.acc)}%</span>
                  <span className="m">{Math.round(s.wpm || 0)}</span>
                  <Icon name="chev" />
                </button>
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
    </main>
  );
}
