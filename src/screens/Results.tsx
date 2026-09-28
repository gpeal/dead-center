import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Star } from '../components/Icon';
import { Kc, SectionH, type Tab } from '../components/common';
import { KeyboardView } from '../components/KeyboardView';
import { dirWords, troubleKeys } from '../lib/analysis';
import { drawDots } from '../lib/draw';
import { confetti, sound, toast } from '../lib/feedback';
import { modeName } from '../lib/game';
import { lab } from '../lib/keys';
import type { Kb } from '../lib/keyboard';
import type { RoundResult } from '../lib/round';
import { allTaps, type Mode, type Tap } from '../lib/store';
import { pct, reduceMotion } from '../lib/util';

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (reduceMotion()) {
      el.textContent = Math.round(to) + suffix;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + suffix;
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, suffix]);
  return <span ref={ref} className="num">0</span>;
}

export function Results({ result, onStart, onClose }: { result: RoundResult; onStart: (mode: Mode, focus?: string[]) => void; onClose: (then: Tab) => void }) {
  const { sess: s, xp, before, after, got, taps, pbW } = result;
  const acc = s.acc, prec = s.prec || 0;
  const grade = acc >= 0.99 && prec >= 0.6 ? 'Dead center.' : acc >= 0.96 ? 'Sharp.' : acc >= 0.9 ? 'Solid.' : acc >= 0.8 ? 'Getting there.' : 'Wobbly.';
  const stars = +(acc >= 0.9) + +(acc >= 0.96) + +(acc >= 0.99 || (acc >= 0.975 && prec >= 0.6));
  const byKey: Record<string, Tap[]> = {};
  for (const t of taps) if (t.h !== t.k) (byKey[t.k] ||= []).push(t);
  const missKeys = Object.entries(byKey).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const lvUp = after.lvl > before.lvl;
  const [xpW, setXpW] = useState(lvUp ? 0 : pct(before.into / before.need));
  const [focus] = useState(() => (missKeys.length ? missKeys.slice(0, 2).map((m) => m[0]) : troubleKeys(allTaps()).slice(0, 2).map((t) => t.k)));

  const celebrated = useRef(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => setXpW(pct(after.into / after.need)), 450);
    let c = 0;
    if (lvUp || s.hits === s.n || pbW) c = window.setTimeout(confetti, 350);
    if (!celebrated.current) {
      celebrated.current = true;
      if (lvUp || s.hits === s.n || pbW) sound('chime');
      got.forEach((a) => toast(a.ic, a.name, a.desc));
    }
    return () => {
      clearTimeout(t);
      clearTimeout(c);
    };
  }, [after, got, lvUp, pbW, s]);
  const paint = useCallback((kb: Kb) => {
    const cv = kb.el.parentElement?.querySelector('canvas');
    if (cv) drawDots(cv, kb, taps);
  }, [taps]);

  return (
    <div className="overlay" id="results">
      <div className="app">
        <div className="screen">
          <div className="res-hero">
            <span className="eyebrow">{modeName(s)} complete</span>
            <h1>{grade}</h1>
            <div className="stars" aria-label={`${stars} of 3`}>{[0, 1, 2].map((i) => <Star key={i} on={i < stars} />)}</div>
          </div>
          <div className="statgrid">
            <div className="tile"><span className="eyebrow">Accuracy</span><CountUp to={acc * 100} suffix="%" /></div>
            <div className="tile"><span className="eyebrow">Centered</span><CountUp to={prec * 100} suffix="%" /></div>
            <div className="tile"><span className="eyebrow">Speed</span><CountUp to={s.wpm || 0} suffix=" wpm" /></div>
            <div className="tile"><span className="eyebrow">Best combo</span><CountUp to={s.combo || 0} /></div>
          </div>
          <SectionH title="Where you landed"><span className="eyebrow">{taps.length} taps</span></SectionH>
          <section className="card mapcard">
            <KeyboardView className="mapwrap" paint={paint}><canvas /></KeyboardView>
            <div className="legend"><span className="dot" style={{ background: 'var(--green)' }} />hit <span className="dot" style={{ background: 'var(--red)' }} />miss</div>
          </section>
          <section className="card xpcard">
            <div className="row"><span className="eyebrow">Score {s.score}</span><b className="num" style={{ fontSize: 22, color: 'var(--accent)' }}>+{xp} XP</b></div>
            <div className="bar"><i style={{ width: xpW + '%' }} /></div>
            <div className="xpmeta"><span>Level {after.lvl} · {after.rank}</span><span>{after.into} / {after.need}</span></div>
          </section>
          {lvUp && (
            <div className="levelup">
              <Icon name="bolt" />
              <div>
                <b>Level {after.lvl}{after.rank !== before.rank ? ` · ${after.rank}` : ''}</b>
                <span>{after.rank !== before.rank ? 'New rank unlocked.' : 'Keep the streak going.'}</span>
              </div>
            </div>
          )}
          {pbW && <div className="samplebar" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}><b>New speed record: {Math.round(s.wpm || 0)} wpm.</b></div>}
          <SectionH title="This round" />
          <section className="card notes">
            {missKeys.map(([k, arr]) => {
              const hits: Record<string, number> = {};
              arr.forEach((t) => (hits[t.h] = (hits[t.h] || 0) + 1));
              const topH = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
              const mx = arr.reduce((a, t) => a + t.dx, 0) / arr.length, my = arr.reduce((a, t) => a + t.dy, 0) / arr.length;
              return (
                <div className="note" key={k}>
                  <Kc k={k} />
                  <span><b>{arr.length} miss{arr.length > 1 ? 'es' : ''}</b>, mostly onto {lab(topH[0])}, {dirWords(mx, my)} of center.</span>
                </div>
              );
            })}
            {result.caseSlips > 0 && (
              <div className="note"><Kc k="shift" /><span><b>{result.caseSlips} wrong-case letter{result.caseSlips > 1 ? 's' : ''}.</b> Right key, but Shift was {result.caseSlips > 1 ? 'off or left on' : 'in the wrong state'}.</span></div>
            )}
            {result.realigns > 0 && (
              <div className="note"><span className="kc" aria-hidden="true">⇆</span><span><b>Got out of step {result.realigns} time{result.realigns > 1 ? 's' : ''}.</b> Letters after each slip weren't counted.</span></div>
            )}
            {!missKeys.length && !result.caseSlips && (
              <div className="note"><Star on size={34} /><span><b>No misses.</b> {result.maxBull >= 5 ? `Best bullseye run: ${result.maxBull}.` : 'Every tap found its key.'}</span></div>
            )}
          </section>
          {got.length > 0 && (
            <>
              <SectionH title="Unlocked" />
              <div className="ach">
                {got.map((a) => <div key={a.id} className="badge"><span className="ic"><Icon name={a.ic} /></span><div><b>{a.name}</b><span>{a.desc}</span></div></div>)}
              </div>
            </>
          )}
          <div className="btnstack">
            <button className="btn primary block" onClick={() => onStart('round')}><Icon name="play" />Next round</button>
            {focus.length > 0 && <button className="btn gold block" onClick={() => onStart('drill', focus)}><Icon name="target" />Drill {focus.map(lab).join(' and ')}</button>}
            <button className="btn ghost block" onClick={() => onClose('map')}>See my tap map</button>
            <button className="linkbtn" style={{ padding: 8 }} onClick={() => onClose('home')}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
