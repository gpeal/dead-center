import { KEYS, KEY, KH, PITCH, TRAINABLE, hitTest } from './keys';
import { ALL, recencyWeights, recentHalf, slowHalf, statsFor, zoneStats, type KeyStats } from './analysis';
import { clamp, cssVar, gauss, median, pct, reduceMotion, rng } from './util';
import type { Kb } from './keyboard';
import type { Tap } from './store';

export type MapMode = 'heat' | 'aim' | 'zones' | 'miss';

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
/** The all-taps map. `half` is the recency half-life (recentHalf() fades older taps; ALL treats every tap the same). */
/** Spread rings are two standard deviations across each axis, so about 86% of taps (1 - e^-2) land inside. */
export const RING_SD = 2;
/** Share of the spread ring's area (centered on the average tap, radii = RING_SD × spread) that lies on the key. */
export function ringOnKey(key: { w: number; h: number }, mx: number, my: number, rx: number, ry: number) {
  const N = 24, hw = key.w / 2, hh = key.h / 2;
  let inside = 0, total = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const u = ((i + 0.5) / N) * 2 - 1, v = ((j + 0.5) / N) * 2 - 1;
      if (u * u + v * v > 1) continue;
      total++;
      if (Math.abs(mx + u * rx) <= hw && Math.abs(my + v * ry) <= hh) inside++;
    }
  return total ? inside / total : 1;
}
export function drawMap(cv: HTMLCanvasElement, kb: Kb, taps: Tap[], mode: MapMode, half = recentHalf()) {
  const { c, W, H, dpr } = sizeCanvas(cv, kb);
  c.clearRect(0, 0, W, H);
  const P = (x: number, y: number) => kb.toPx(x, y);
  for (const k of KEYS) kb.keyEls[k.id].style.background = '';
  kb.el.classList.toggle('dim', mode === 'zones');
  if (mode === 'heat') {
    const off = document.createElement('canvas');
    off.width = W * dpr;
    off.height = H * dpr;
    const o = off.getContext('2d')!;
    const wts = recencyWeights(taps, half);
    let total = 0;
    for (const w of wts) total += w;
    const rad = 8.5 * kb.sx * dpr, a = clamp(3 / Math.sqrt(total + 1), 0.05, 0.5);
    for (let i = Math.max(0, taps.length - 8000); i < taps.length; i++) {
      const t = taps[i], key = KEY[t.k];
      if (!key || wts[i] < 0.03) continue;
      const p = P(key.cx + t.dx, key.cy + t.dy), x = p.x * dpr, y = p.y * dpr;
      const g = o.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(0,0,0,${a * wts[i]})`);
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
      const s = statsFor(taps, k, half);
      if (s.n < 4) continue;
      const key = KEY[k], cp = P(key.cx, key.cy), mp = P(key.cx + s.mx, key.cy + s.my);
      // the long-run average, faint, so the recent arrow shows which way it has moved
      if (half !== ALL) {
        const slow = statsFor(taps, k, slowHalf());
        if (slow.n >= 12 && Math.hypot(slow.mx - s.mx, slow.my - s.my) > 0.6) {
          const op = P(key.cx + slow.mx, key.cy + slow.my);
          c.globalAlpha = 0.35;
          c.strokeStyle = ink;
          c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(cp.x, cp.y); c.lineTo(op.x, op.y); c.stroke();
          c.beginPath(); c.arc(op.x, op.y, 2.6, 0, 7); c.stroke();
          c.globalAlpha = 1;
        }
      }
      const on = ringOnKey(key, s.mx, s.my, Math.max(2 / kb.sx, RING_SD * s.sdx), Math.max(2 / kb.sy, RING_SD * s.sdy));
      const col = on >= 0.95 ? green : on >= 0.8 ? gold : red;
      c.globalAlpha = 0.9;
      c.strokeStyle = col;
      c.fillStyle = col;
      c.setLineDash([2, 2.5]);
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(mp.x, mp.y, Math.max(2, RING_SD * s.sdx * kb.sx), Math.max(2, RING_SD * s.sdy * kb.sy), 0, 0, 7);
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
  } else if (mode === 'zones') {
    paintZones(c, kb, taps, half);
  } else {
    const red = cssVar('--red'), green = cssVar('--green'), gold = cssVar('--gold');
    c.font = `500 ${Math.round(9 * kb.sx)}px ${cssVar('--f-mono')}`;
    c.textAlign = 'center';
    for (const k of TRAINABLE) {
      const s = statsFor(taps, k, half);
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
export const ARROW_SCALE = 2;
/** Zone drift is an average over several keys, so it's smaller than one key's; it's drawn longer to stay readable. */
export const ZONE_SCALE = 4;
/** Same miss-rate bands as the Misses map. */
const missCol = (e: number) => cssVar(e < 0.03 ? '--green' : e < 0.09 ? '--gold' : '--red');
/** Rows split by side (see ZONES): each zone's keys tinted by its accuracy, outlined together, with one drift arrow. */
function paintZones(c: CanvasRenderingContext2D, kb: Kb, taps: Tap[], half: number) {
  const ink = cssVar('--kb-ink'), halo = cssVar('--kb-key');
  for (const z of zoneStats(taps, half)) {
    if (z.n < 4) continue;
    const ks = z.zone.keys.map((k) => KEY[k]), e = 1 - z.acc, col = missCol(e);
    for (const k of ks) kb.keyEls[k.id].style.background = `color-mix(in srgb, ${col} ${Math.round(clamp(18 + e * 260, 18, 70))}%, var(--kb-key))`;
    const x0 = Math.min(...ks.map((k) => k.x)), x1 = Math.max(...ks.map((k) => k.x + k.w)), y0 = ks[0].y, y1 = ks[0].y + ks[0].h;
    const a = kb.toPx(x0 - 2, y0 - 2), b = kb.toPx(x1 + 2, y1 + 2);
    c.strokeStyle = col;
    c.lineWidth = 1.6;
    c.beginPath();
    c.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 10 * kb.sx);
    c.stroke();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, o = kb.toPx(cx, cy), t = kb.toPx(cx + z.mx * ZONE_SCALE, cy + z.my * ZONE_SCALE);
    const len = Math.hypot(t.x - o.x, t.y - o.y);
    if (len < 3) {
      c.fillStyle = ink;
      c.beginPath(); c.arc(o.x, o.y, 3, 0, 7); c.fill();
      continue;
    }
    // a key-coloured halo under the arrow keeps it readable over the letters
    const ux = (t.x - o.x) / len, uy = (t.y - o.y) / len, h = Math.min(7, len * 0.6);
    const head = () => {
      c.beginPath();
      c.moveTo(t.x, t.y);
      c.lineTo(t.x - ux * h - uy * h * 0.6, t.y - uy * h + ux * h * 0.6);
      c.lineTo(t.x - ux * h + uy * h * 0.6, t.y - uy * h - ux * h * 0.6);
      c.closePath();
    };
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const [stroke, w] of [[halo, 6], [ink, 2.6]] as const) {
      c.strokeStyle = stroke;
      c.fillStyle = stroke;
      c.lineWidth = w;
      c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(t.x - ux * h * 0.6, t.y - uy * h * 0.6); c.stroke();
      head();
      if (stroke === halo) c.stroke();
      c.fill();
    }
    c.beginPath(); c.arc(o.x, o.y, 2.4, 0, 7); c.fill();
  }
}
/** The round's zones on their own canvas (the Results screen's Zones view; the Map uses drawMap). */
export function drawZones(cv: HTMLCanvasElement, kb: Kb, taps: Tap[]) {
  const { c, W, H } = sizeCanvas(cv, kb);
  c.clearRect(0, 0, W, H);
  for (const k of KEYS) {
    kb.keyEls[k.id].style.background = '';
    kb.keyEls[k.id].style.boxShadow = '';
  }
  kb.el.classList.add('dim');
  paintZones(c, kb, taps, ALL);
}
/**
 * The round on the full keyboard: every key you typed gets one arrow from its center to your median tap (green,
 * gold or red by distance; a dot when you were dead on). The worst keys (`keys`) are also outlined, with a red dot
 * where each miss landed; their magnifiers carry the full detail.
 */
export function drawMissKeys(cv: HTMLCanvasElement, kb: Kb, taps: Tap[], keys: string[]) {
  const { c } = sizeCanvas(cv, kb);
  const red = cssVar('--red'), green = cssVar('--green'), gold = cssVar('--gold'), edge = cssVar('--kb-key');
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
  const byKey: Record<string, Tap[]> = {};
  for (const t of taps) if (KEY[t.k]) (byKey[t.k] ||= []).push(t);
  for (const [k, arr] of Object.entries(byKey)) {
    if (arr.length < 2) continue;
    const key = KEY[k], mx = k === 'space' ? 0 : median(arr.map((t) => t.dx)), my = median(arr.map((t) => t.dy)), mag = Math.hypot(mx, my);
    const col = mag < 1.6 ? green : mag < 3.4 ? gold : red;
    const o = kb.toPx(key.cx, key.cy), e = kb.toPx(key.cx + mx * ARROW_SCALE, key.cy + my * ARROW_SCALE);
    c.fillStyle = col;
    c.strokeStyle = col;
    if (mag < 0.8) {
      c.beginPath();
      c.arc(o.x, o.y, 2.6, 0, 7);
      c.fill();
      continue;
    }
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(o.x, o.y);
    c.lineTo(e.x, e.y);
    c.stroke();
    c.beginPath();
    c.arc(e.x, e.y, 2.8, 0, 7);
    c.fill();
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

export interface Loupe { k: string; x: number; label: string }
/**
 * Magnifiers above the keyboard: one circle per key, centered over it where there is room, with a leader line
 * down to the key. `stripH` is the height of the band above the keyboard; the keyboard starts right below it.
 */
export function drawLoupes(cv: HTMLCanvasElement, kb: Kb, loupes: Loupe[], statsOf: (k: string) => KeyStats, D: number, stripH: number) {
  const dpr = devicePixelRatio || 1, W = kb.el.clientWidth, H = stripH + kb.el.clientHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const red = cssVar('--red'), ink = cssVar('--ink'), surface = cssVar('--surface');
  const cy = D / 2 + 2;
  for (const l of loupes) {
    const key = KEY[l.k], top = kb.toPx(key.cx, key.y);
    // leader line from the loupe to the top of its key
    c.strokeStyle = red;
    c.globalAlpha = 0.45;
    c.lineWidth = 1.25;
    c.beginPath();
    c.moveTo(l.x, cy + D / 2);
    c.lineTo(top.x, stripH + top.y);
    c.stroke();
    c.globalAlpha = 1;
    const off = document.createElement('canvas');
    drawScatter(off, l.k, statsOf(l.k), { reach: 0.72, width: D, square: true });
    c.save();
    c.beginPath();
    c.arc(l.x, cy, D / 2, 0, 7);
    c.clip();
    c.drawImage(off, l.x - D / 2, cy - D / 2, D, D);
    c.restore();
    c.lineWidth = 2;
    c.strokeStyle = red;
    c.beginPath();
    c.arc(l.x, cy, D / 2, 0, 7);
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = surface;
    c.beginPath();
    c.arc(l.x, cy, D / 2 + 2.5, 0, 7);
    c.stroke();
  }
  // labels go on top, with a backing so leader lines never run through the text
  c.font = `600 11.5px ${cssVar('--f-mono')}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const l of loupes) {
    const y = D + 14, tw = c.measureText(l.label).width + 10;
    c.fillStyle = surface;
    c.fillRect(l.x - tw / 2, y - 8, tw, 16);
    c.fillStyle = ink;
    c.fillText(l.label, l.x, y);
  }
}

/** Centers of up to three loupes: as close to their keys as possible without overlapping or leaving the card. */
export function placeLoupes(xs: number[], D: number, W: number, gap = 10) {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const lo = D / 2, hi = W - D / 2;
  const pos = order.map((o) => Math.min(hi, Math.max(lo, o.x)));
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + D + gap);
  for (let i = pos.length - 1; i >= 0; i--) {
    pos[i] = Math.min(pos[i], i === pos.length - 1 ? hi : pos[i + 1] - D - gap);
    pos[i] = Math.max(pos[i], lo);
  }
  const out: number[] = [];
  order.forEach((o, j) => (out[o.i] = pos[j]));
  return out;
}
export function drawScatter(cv: HTMLCanvasElement, k: string, s: KeyStats, { reach = 1.55, padY = 22, width = 0, square = false } = {}) {
  const key = KEY[k], dpr = devicePixelRatio || 1, W = width || cv.clientWidth || 320;
  const spanX = k === 'space' ? key.w / 2 + 30 : key.w / 2 + PITCH * reach, spanY = square ? spanX : KH / 2 + padY, sc = W / (2 * spanX), H = Math.round(2 * spanY * sc);
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
    c.ellipse(mx, my, Math.max(3, RING_SD * s.sdx * sc), Math.max(3, RING_SD * s.sdy * sc), 0, 0, 7);
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
  // most taps land clearly low and left of O (enough for the drift arrow to read at this size); every fourth misses,
  // alternately left onto I and down onto K
  const offset = (i: number): [number, number] =>
    i % 8 === 3 ? [-25 + gauss(r) * 4, 1 + gauss(r) * 5] : i % 8 === 7 ? [-15 + gauss(r) * 4, 41 + gauss(r) * 3] : [-10 + gauss(r) * 2.2, 11 + gauss(r) * 2];
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
      const [dx, dy] = offset(dots.length);
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
      const mx = median(dots.map((d) => d.dx)), my = median(dots.map((d) => d.dy)), p = clamp((e - 3500) / 600, 0, 1);
      const cx = X(key.cx), cy = Y(key.cy), ex = cx + (X(key.cx + mx) - cx) * p, ey = cy + (Y(key.cy + my) - cy) * p;
      c.strokeStyle = cssVar('--gold');
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = cssVar('--gold');
      c.beginPath(); c.arc(ex, ey, 4.5, 0, 7); c.fill();
      if (p >= 1) {
        // the average drift, in the empty corner right of L so it never covers the taps
        const lines = [`${Math.round(Math.abs(my))} pt low`, `${Math.round(Math.abs(mx))} pt left`];
        c.font = `600 11px ${cssVar('--f-mono')}`;
        const tw = Math.max(...lines.map((l) => c.measureText(l).width)) + 26, th = 38, bx = W - tw - 5, by = H - th - 6;
        c.fillStyle = cssVar('--ink');
        c.beginPath();
        if (c.roundRect) c.roundRect(bx, by, tw, th, 8);
        else c.rect(bx, by, tw, th);
        c.fill();
        c.fillStyle = cssVar('--gold');
        c.beginPath();
        c.arc(bx + 10, by + th / 2, 4, 0, 7);
        c.fill();
        c.fillStyle = cssVar('--bg');
        c.textAlign = 'left';
        lines.forEach((l, i) => c.fillText(l, bx + 19, by + 12 + i * 14));
        c.textAlign = 'center';
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
      const [dx, dy] = offset(i);
      dots.push({ dx, dy, b: -1e4, hit: hitTest(KEY.o.cx + dx, KEY.o.cy + dy) === 'o' });
    }
    t0 = performance.now() - 5000;
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
