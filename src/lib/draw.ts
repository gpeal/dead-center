import { KEYS, KEY, KH, PITCH, TRAINABLE, hitTest } from './keys';
import { statsFor, type KeyStats } from './analysis';
import { clamp, cssVar, fmt1, gauss, pct, reduceMotion, rng } from './util';
import type { Kb } from './keyboard';
import type { Tap } from './store';

export type MapMode = 'heat' | 'aim' | 'miss';

/* heat colour ramp: blue -> gold -> red, matching the target rings */
const HEAT_STOPS: [number, number[]][] = [[0, [36, 88, 240, 0]], [0.18, [36, 88, 240, 110]], [0.45, [80, 140, 255, 170]], [0.65, [245, 179, 1, 205]], [0.85, [229, 72, 77, 225]], [1, [170, 20, 50, 235]]];
let HEAT_LUT: Uint8ClampedArray | null = null;
function heatLut() {
  if (HEAT_LUT) return HEAT_LUT;
  HEAT_LUT = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let j = 0;
    while (j < HEAT_STOPS.length - 2 && v > HEAT_STOPS[j + 1][0]) j++;
    const [a, ca] = HEAT_STOPS[j], [b, cb] = HEAT_STOPS[j + 1], t = (v - a) / (b - a);
    for (let c = 0; c < 4; c++) HEAT_LUT[i * 4 + c] = ca[c] + (cb[c] - ca[c]) * t;
  }
  return HEAT_LUT;
}
function sizeCanvas(cv: HTMLCanvasElement, kb: Kb) {
  const dpr = devicePixelRatio || 1, W = kb.el.clientWidth, H = kb.el.clientHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  return { c, W, H, dpr };
}
export function drawMap(cv: HTMLCanvasElement, kb: Kb, taps: Tap[], mode: MapMode) {
  const { c, W, H, dpr } = sizeCanvas(cv, kb);
  c.clearRect(0, 0, W, H);
  const P = (x: number, y: number) => kb.toPx(x, y);
  for (const k of KEYS) kb.keyEls[k.id].style.background = '';
  if (mode === 'heat') {
    const off = document.createElement('canvas');
    off.width = W * dpr;
    off.height = H * dpr;
    const o = off.getContext('2d')!;
    const rad = 8.5 * kb.sx * dpr, list = taps.slice(-4000), a = clamp(3 / Math.sqrt(list.length + 1), 0.05, 0.5);
    for (const t of list) {
      const key = KEY[t.k];
      if (!key) continue;
      const p = P(key.cx + t.dx, key.cy + t.dy), x = p.x * dpr, y = p.y * dpr;
      const g = o.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = g;
      o.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (!off.width || !off.height) return;
    const img = o.getImageData(0, 0, off.width, off.height), d = img.data;
    let mx = 1;
    for (let i = 3; i < d.length; i += 4) if (d[i] > mx) mx = d[i];
    const lut = heatLut();
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.min(255, Math.round(Math.pow(d[i + 3] / mx, 0.8) * 255));
      d[i] = lut[v * 4]; d[i + 1] = lut[v * 4 + 1]; d[i + 2] = lut[v * 4 + 2]; d[i + 3] = lut[v * 4 + 3];
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.putImageData(img, 0, 0);
    c.scale(dpr, dpr);
    // key centers
    c.strokeStyle = cssVar('--kb-ink');
    c.globalAlpha = 0.35;
    c.lineWidth = 1;
    for (const k of KEYS) {
      if (k.type === 'mod') continue;
      const p = P(k.cx, k.cy);
      c.beginPath();
      c.moveTo(p.x - 3, p.y); c.lineTo(p.x + 3, p.y); c.moveTo(p.x, p.y - 3); c.lineTo(p.x, p.y + 3);
      c.stroke();
    }
    c.globalAlpha = 1;
  } else if (mode === 'aim') {
    const gold = cssVar('--gold'), green = cssVar('--green'), red = cssVar('--red'), ink = cssVar('--kb-ink');
    for (const k of TRAINABLE) {
      const s = statsFor(taps, k, 100);
      if (s.n < 4) continue;
      const key = KEY[k], cp = P(key.cx, key.cy), mp = P(key.cx + s.mx, key.cy + s.my);
      const mag = Math.hypot(s.mx, s.my), col = mag < 1.6 ? green : mag < 3.4 ? gold : red;
      c.globalAlpha = 0.9;
      c.strokeStyle = col;
      c.fillStyle = col;
      c.setLineDash([2, 2.5]);
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(mp.x, mp.y, Math.max(2, s.sdx * kb.sx), Math.max(2, s.sdy * kb.sy), 0, 0, 7);
      c.stroke();
      c.setLineDash([]);
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(cp.x, cp.y); c.lineTo(mp.x, mp.y); c.stroke();
      c.beginPath(); c.arc(mp.x, mp.y, 3.4, 0, 7); c.fill();
      c.globalAlpha = 0.55;
      c.strokeStyle = ink;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cp.x - 3, cp.y); c.lineTo(cp.x + 3, cp.y); c.moveTo(cp.x, cp.y - 3); c.lineTo(cp.x, cp.y + 3);
      c.stroke();
      c.globalAlpha = 1;
    }
  } else {
    const red = cssVar('--red'), green = cssVar('--green'), gold = cssVar('--gold');
    c.font = `500 ${Math.round(9 * kb.sx)}px ${cssVar('--f-mono')}`;
    c.textAlign = 'center';
    for (const k of TRAINABLE) {
      const s = statsFor(taps, k, 100);
      if (s.n < 4) continue;
      const key = KEY[k], e = 1 - s.acc, col = e < 0.03 ? green : e < 0.09 ? gold : red;
      kb.keyEls[k].style.background = `color-mix(in srgb, ${col} ${Math.round(clamp(18 + e * 260, 18, 70))}%, var(--kb-key))`;
      const p = P(key.cx, key.y + key.h - 4);
      c.fillStyle = cssVar('--kb-ink');
      c.globalAlpha = 0.7;
      c.fillText(pct(e) + '%', p.x, p.y);
      c.globalAlpha = 1;
    }
  }
}
export function drawDots(cv: HTMLCanvasElement, kb: Kb, taps: Tap[]) {
  const { c } = sizeCanvas(cv, kb);
  const g = cssVar('--green'), rd = cssVar('--red'), wh = cssVar('--kb-key');
  const draw = (miss: boolean) => {
    for (const t of taps) {
      if ((t.h !== t.k) !== miss) continue;
      const key = KEY[t.k], p = kb.toPx(key.cx + t.dx, key.cy + t.dy);
      c.beginPath();
      c.arc(p.x, p.y, miss ? 3.6 : 3, 0, 7);
      c.fillStyle = miss ? rd : g;
      c.globalAlpha = miss ? 0.95 : 0.7;
      c.fill();
      if (miss) {
        c.globalAlpha = 1;
        c.strokeStyle = wh;
        c.lineWidth = 1;
        c.stroke();
      }
    }
  };
  draw(false);
  draw(true);
  c.globalAlpha = 1;
}
/** Zoomed view of one key and its neighbors with each tap on it. `reach` is how many key widths to show on each side. */
/** The round's most-missed keys, outlined on the full keyboard, with a dot where each of their misses landed. */
export function drawMissKeys(cv: HTMLCanvasElement, kb: Kb, taps: Tap[], keys: string[]) {
  const { c } = sizeCanvas(cv, kb);
  const red = cssVar('--red'), edge = cssVar('--kb-key');
  for (const k of KEYS) {
    const e = kb.keyEls[k.id];
    e.style.background = '';
    e.style.boxShadow = '';
  }
  for (const k of keys) {
    const e = kb.keyEls[k];
    if (!e) continue;
    e.style.background = 'color-mix(in srgb, var(--red) 28%, var(--kb-key))';
    e.style.boxShadow = 'inset 0 0 0 2px var(--red)';
  }
  for (const t of taps) {
    if (t.h === t.k || !keys.includes(t.k)) continue;
    const key = KEY[t.k], p = kb.toPx(key.cx + t.dx, key.cy + t.dy);
    c.beginPath();
    c.arc(p.x, p.y, 3.4, 0, 7);
    c.fillStyle = red;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = 1;
    c.stroke();
  }
}
export function drawScatter(cv: HTMLCanvasElement, k: string, s: KeyStats, { reach = 1.55, padY = 22 } = {}) {
  const key = KEY[k], dpr = devicePixelRatio || 1, W = cv.clientWidth || 320;
  const spanX = k === 'space' ? key.w / 2 + 30 : key.w / 2 + PITCH * reach, spanY = KH / 2 + padY, sc = W / (2 * spanX), H = Math.round(2 * spanY * sc);
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.height = H + 'px';
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const X = (x: number) => W / 2 + (x - key.cx) * sc, Y = (y: number) => H / 2 + (y - key.cy) * sc;
  c.fillStyle = cssVar('--kb-bg');
  c.fillRect(0, 0, W, H);
  c.font = `400 ${Math.round(22.5 * sc * 0.8)}px ${cssVar('--f-kb')}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const o of KEYS) {
    const x = X(o.x), y = Y(o.y), w = o.w * sc, h = o.h * sc;
    if (x > W || x + w < 0 || y > H || y + h < 0) continue;
    c.fillStyle = cssVar('--kb-key');
    c.globalAlpha = o.id === k ? 1 : 0.75;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, 8.5 * sc);
    else c.rect(x, y, w, h);
    c.fill();
    c.globalAlpha = o.id === k ? 0.2 : 0.4;
    c.fillStyle = cssVar('--kb-ink');
    if (o.type === 'letter') c.fillText(o.id.toUpperCase(), x + w / 2, y + h / 2 + 1);
    c.globalAlpha = 1;
  }
  // scoring rings
  const hw = (key.w / 2) * sc, hh = (key.h / 2) * sc;
  c.strokeStyle = cssVar('--accent');
  c.globalAlpha = 0.55;
  c.setLineDash([3, 3]);
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(X(key.cx), Y(key.cy), hw * 0.75, hh * 0.75, 0, 0, 7);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 0.16;
  c.fillStyle = cssVar('--gold');
  c.beginPath();
  c.ellipse(X(key.cx), Y(key.cy), hw * 0.4, hh * 0.4, 0, 0, 7);
  c.fill();
  c.globalAlpha = 1;
  const green = cssVar('--green'), red = cssVar('--red'), arr = s.arr.slice(-120);
  arr.forEach((t, i) => {
    const rec = i >= arr.length - 10;
    c.globalAlpha = rec ? 0.95 : 0.62;
    c.fillStyle = t.h === k ? green : red;
    c.beginPath();
    c.arc(X(key.cx + t.dx), Y(key.cy + t.dy), rec ? 3.8 : 3, 0, 7);
    c.fill();
  });
  c.globalAlpha = 1;
  if (s.n >= 4) {
    const mx = X(key.cx + s.mx), my = Y(key.cy + s.my), gold = cssVar('--gold');
    c.strokeStyle = gold;
    c.lineWidth = 2;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.ellipse(mx, my, Math.max(3, s.sdx * sc), Math.max(3, s.sdy * sc), 0, 0, 7);
    c.stroke();
    c.setLineDash([]);
    c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(X(key.cx), Y(key.cy)); c.lineTo(mx, my); c.stroke();
    c.fillStyle = gold;
    c.beginPath(); c.arc(mx, my, 5, 0, 7); c.fill();
    c.strokeStyle = cssVar('--kb-key');
    c.lineWidth = 1.5;
    c.stroke();
  }
  c.strokeStyle = cssVar('--kb-ink');
  c.lineWidth = 1.3;
  c.globalAlpha = 0.8;
  const cx = X(key.cx), cy = Y(key.cy);
  c.beginPath(); c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy); c.moveTo(cx, cy - 6); c.lineTo(cx, cy + 6); c.stroke();
  c.globalAlpha = 1;
}

/** The first-run demo: taps land around O, then the average drift is drawn. Returns a stop function. */
export function heroAnim(cv: HTMLCanvasElement) {
  let raf = 0;
  const r = rng(5);
  const dots: { dx: number; dy: number; b: number; hit: boolean }[] = [];
  let t0 = performance.now(), last = 0;
  const focusK = 'o';
  function frame(t: number) {
    if (!cv.isConnected) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) {
      raf = requestAnimationFrame(frame);
      return;
    }
    if (cv.width !== W * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
    }
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const key = KEY[focusK], sc = Math.min(W / (PITCH * 4.6), H / (54 * 2.05));
    const X = (x: number) => W / 2 + (x - key.cx) * sc, Y = (y: number) => H / 2 + (y - (key.cy + 27)) * sc;
    c.fillStyle = cssVar('--kb-bg');
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `400 ${Math.round(22.5 * sc * 0.9)}px ${cssVar('--f-kb')}`;
    for (const o of KEYS) {
      if (o.type !== 'letter') continue;
      const x = X(o.x), y = Y(o.y), w = o.w * sc, h = o.h * sc;
      if (x > W || x + w < 0 || y > H || y + h < 0) continue;
      c.fillStyle = cssVar('--kb-key');
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, h, 8.5 * sc);
      else c.rect(x, y, w, h);
      c.fill();
      c.fillStyle = cssVar('--kb-ink');
      c.globalAlpha = o.id === focusK ? 0.9 : 0.45;
      c.fillText(o.id.toUpperCase(), x + w / 2, y + h / 2 + 1);
      c.globalAlpha = 1;
    }
    const e = t - t0;
    if (e > 8200) {
      dots.length = 0;
      t0 = t;
      last = 0;
    }
    if (e - last > 320 && dots.length < 16 && e < 6000) {
      last = e;
      const dx = -2.6 + gauss(r) * 3.2, dy = 3 + gauss(r) * 2.6;
      dots.push({ dx, dy, b: t, hit: hitTest(key.cx + dx, key.cy + dy) === focusK });
    }
    for (const d of dots) {
      const age = (t - d.b) / 1000, x = X(key.cx + d.dx), y = Y(key.cy + d.dy);
      if (age < 0.5) {
        c.strokeStyle = d.hit ? cssVar('--green') : cssVar('--red');
        c.globalAlpha = 1 - age * 2;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 4 + age * 30, 0, 7);
        c.stroke();
      }
      c.globalAlpha = 0.9;
      c.fillStyle = d.hit ? cssVar('--green') : cssVar('--red');
      c.beginPath();
      c.arc(x, y, 4.2, 0, 7);
      c.fill();
      c.globalAlpha = 1;
    }
    if (dots.length >= 10) {
      const n = dots.length, mx = dots.reduce((a, d) => a + d.dx, 0) / n, my = dots.reduce((a, d) => a + d.dy, 0) / n, p = clamp((e - 3500) / 600, 0, 1);
      const cx = X(key.cx), cy = Y(key.cy), ex = cx + (X(key.cx + mx) - cx) * p, ey = cy + (Y(key.cy + my) - cy) * p;
      c.strokeStyle = cssVar('--gold');
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = cssVar('--gold');
      c.beginPath(); c.arc(ex, ey, 6, 0, 7); c.fill();
      if (p >= 1) {
        const txt = `${fmt1(Math.abs(my))} pt low · ${fmt1(Math.abs(mx))} pt left`;
        c.font = `600 11px ${cssVar('--f-mono')}`;
        const tw = c.measureText(txt).width + 16, bx = clamp(ex - tw / 2, 6, W - tw - 6), by = Math.min(H - 28, ey + 14);
        c.fillStyle = cssVar('--ink');
        c.beginPath();
        if (c.roundRect) c.roundRect(bx, by, tw, 22, 7);
        else c.rect(bx, by, tw, 22);
        c.fill();
        c.fillStyle = cssVar('--bg');
        c.fillText(txt, bx + tw / 2, by + 11.5);
      }
    }
    c.strokeStyle = cssVar('--kb-ink');
    c.lineWidth = 1.3;
    const cx = X(key.cx), cy = Y(key.cy);
    c.beginPath(); c.moveTo(cx - 6, cy); c.lineTo(cx + 6, cy); c.moveTo(cx, cy - 6); c.lineTo(cx, cy + 6); c.stroke();
    if (!reduceMotion()) raf = requestAnimationFrame(frame);
  }
  if (reduceMotion()) {
    for (let i = 0; i < 14; i++) {
      const dx = -2.6 + gauss(r) * 3.2, dy = 3 + gauss(r) * 2.6;
      dots.push({ dx, dy, b: -1e4, hit: hitTest(KEY.o.cx + dx, KEY.o.cy + dy) === 'o' });
    }
    t0 = performance.now() - 5000;
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
