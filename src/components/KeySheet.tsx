import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Kc, LineChart, useActions, useScheme } from './common';
import { diagnose, dirWords, drillImpact, masteryLabel, sessionSeries, statsFor } from '../lib/analysis';
import { drawScatter } from '../lib/draw';
import { lab } from '../lib/keys';
import { dataset } from '../lib/store';
import { fmt1, pct } from '../lib/util';

/** A bottom sheet you can drag down (by the grabber, or by the content when it is scrolled to the top) to close. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), grab = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 190);
    return () => clearTimeout(t);
  }, [closing, onClose]);
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, []);
  useEffect(() => {
    const sh = sheet.current!, g = grab.current!, b = body.current!;
    let y0: number | null = null, dragging = false;
    const settle = (d: number) => {
      dragging = false;
      y0 = null;
      if (d > 80) close();
      else {
        sh.style.transition = 'transform .25s';
        sh.style.transform = '';
        setTimeout(() => (sh.style.transition = ''), 260);
      }
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('.x')) return;
      y0 = e.clientY;
      dragging = true;
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const move = (e: PointerEvent) => {
      if (dragging && y0 != null) sh.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
    };
    const up = (e: PointerEvent) => {
      if (dragging && y0 != null) settle(e.clientY - y0);
    };
    const cancel = () => {
      if (dragging) settle(0);
    };
    g.addEventListener('pointerdown', down);
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', cancel);
    // pulling down on the content while it is scrolled to the top also drags the sheet
    let ty: number | null = null, pull = false;
    const ts = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
      pull = false;
    };
    const tm = (e: TouchEvent) => {
      if (ty == null) return;
      const d = e.touches[0].clientY - ty;
      if (!pull && d > 6 && b.scrollTop <= 0) pull = true;
      if (pull) {
        if (e.cancelable) e.preventDefault();
        sh.style.transform = `translateY(${Math.max(0, d)}px)`;
      }
    };
    const te = (e: TouchEvent) => {
      if (pull && ty != null) settle((e.changedTouches[0]?.clientY ?? ty) - ty);
      ty = null;
      pull = false;
    };
    b.addEventListener('touchstart', ts, { passive: true });
    b.addEventListener('touchmove', tm, { passive: false });
    b.addEventListener('touchend', te);
    return () => {
      g.removeEventListener('pointerdown', down);
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', cancel);
      b.removeEventListener('touchstart', ts);
      b.removeEventListener('touchmove', tm);
      b.removeEventListener('touchend', te);
    };
  }, []);
  return (
    <>
      <div className="scrim" onClick={close} style={closing ? { opacity: 0, transition: 'opacity .19s' } : undefined} />
      <div ref={sheet} className="sheetp" role="dialog" aria-modal="true" style={closing ? { transition: 'transform .2s ease-in', transform: 'translateY(100%)' } : undefined}>
        <div ref={grab} className="grab">
          <i />
          <button className="x" aria-label="Close" onClick={close}><Icon name="close" /></button>
        </div>
        <div ref={body} className="body">{children}</div>
      </div>
    </>
  );
}

export function KeySheet({ k, onClose }: { k: string; onClose: () => void }) {
  const { start } = useActions();
  const scheme = useScheme();
  const ds = useMemo(() => dataset(), []);
  const s = useMemo(() => statsFor(ds.taps, k), [ds, k]);
  const dg = diagnose(s);
  const [ml, mt] = masteryLabel(s.mastery);
  const imp = ds.sample ? null : drillImpact(ds.taps, ds.sessions, k);
  const series = sessionSeries(ds.taps, k).slice(-20);
  const top = Object.entries(s.conf).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => cv.current && drawScatter(cv.current, k, s));
    return () => cancelAnimationFrame(id);
  }, [k, s, scheme]);
  const lo = Math.min(0.5, ...series.map((x) => Math.floor(x.acc * 10) / 10));
  const d = imp ? Math.round((imp.after - imp.before) * 100) : 0;
  return (
    <Sheet onClose={onClose}>
      <div className="kd-head">
        <Kc k={k} size="lg" />
        <div><h2>{dg.headline}</h2><div className="sub">{s.n} recent taps{ds.sample ? ' · sample data' : ''}</div></div>
        <span className={'pill ' + mt}>{s.n >= 6 ? ml : 'New'}</span>
      </div>
      <canvas ref={cv} className="scatter" role="img" aria-label={`Where your ${lab(k)} taps landed`} />
      <div className="legend">
        <span className="dot" style={{ background: 'var(--green)' }} />hit <span className="dot" style={{ background: 'var(--red)' }} />miss <span className="dot" style={{ background: 'var(--gold)' }} />average <span>· gold zone = bullseye</span>
      </div>
      <div className="kstats">
        <div><small>Accuracy</small><span className="num">{pct(s.acc)}%</span></div>
        <div><small>Drift (pt)</small><span className="num" style={{ fontSize: 15 }}>{s.n ? dirWords(s.mx, s.my).replace('right on center', 'centered').replace(/ pt/g, '') : '–'}</span></div>
        <div><small>Spread</small><span className="num">±{s.n ? fmt1(Math.max(s.sdx, s.sdy)) : '–'}<small> pt</small></span></div>
      </div>
      {top.length > 0 && (
        <div className="confs">
          <span className="eyebrow">Misses land on</span>
          {top.map(([hk, n]) => <span key={hk} className="c"><Kc k={hk} size="sm" />{n}×</span>)}
        </div>
      )}
      <div className="why"><h3>What's happening</h3>{dg.why.map((p) => <p key={p}>{p}</p>)}</div>
      {series.length >= 2 && (
        <div className="why">
          <h3>Accuracy by round</h3>
          <LineChart series={[{ values: series.map((x) => x.acc), color: 'var(--accent)', label: 'Accuracy' }]} yMin={lo} yMax={1} ticks={[0.5, 0.75, 1].filter((v) => v >= lo)} fmt={(v) => Math.round(v * 100) + '%'} height={110} xLabel={(i) => (i === 0 ? 'first' : 'latest')} pointLabel={(i) => `Round ${i + 1} of ${series.length}`} />
        </div>
      )}
      {imp && (
        <div className="samplebar" style={{ background: d >= 0 ? 'var(--green-soft)' : 'var(--red-soft)', color: d >= 0 ? 'var(--green)' : 'var(--red)' }}>
          <div><b>{d >= 0 ? 'Drills are working:' : 'Still settling:'}</b> {pct(imp.before)}% → {pct(imp.after)}% since your first {lab(k)} drill.</div>
        </div>
      )}
      {ds.sample ? (
        <button className="btn primary block" onClick={() => start('baseline')}>Take the baseline to see yours</button>
      ) : (
        <button className="btn gold block" onClick={() => start('drill', [k])}><Icon name="target" />Drill {lab(k)}</button>
      )}
    </Sheet>
  );
}
