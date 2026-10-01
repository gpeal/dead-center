import { KEYS, KEY, KBW, KH, ROWY, LETTERS, EMOJI_C, MIC_C, hitTest, type KeyDef } from './keys';
import { clamp } from './util';
import { iconHtml } from '../components/Icon';

/* The iPhone keyboard is built imperatively: every tap moves popups and key states, and this keeps input latency
   independent of React rendering. The React wrapper (components/KeyboardView) owns its lifetime. */
export type ShiftState = 'on' | 'off' | 'caps';
export interface Kb {
  el: HTMLDivElement; keyEls: Record<string, HTMLDivElement>;
  layout(): void; toKb(cx: number, cy: number): { x: number; y: number }; toPx(x: number, y: number): { x: number; y: number };
  setShift(st: ShiftState): void; popup(k: string): HTMLDivElement | null; flashBad(k: string): void;
  readonly sx: number; readonly sy: number;
}
export interface Point { x: number; y: number }

/* The live keyboard has to sit exactly where the real one does, and iOS draws it differently on the big phones. Taps
   are always stored in the 402pt layout from keys.ts, so stats compare across phones; the live keyboard maps between
   that layout and the screen. Measured from the iOS 27 keyboard on an iPhone 18 Pro (402pt) and Pro Max (440pt). */
interface Metrics { h: number; rows: number[]; kh: number; emojiY: number; micY: number }
const KB_H = 293, MARGIN = 6.67;
const PRO: Metrics = { h: KB_H, rows: ROWY, kh: KH, emojiY: EMOJI_C.y, micY: MIC_C.y };
const MAX: Metrics = { h: 312, rows: [51, 107, 163, 219], kh: 45.33, emojiY: 306, micY: 305 };
const metrics = (w: number) => (w >= 428 ? MAX : PRO);

/** Piecewise-linear map through matching points; each key and each gap between rows stretches on its own. */
function piecewise(a: number[], b: number[]) {
  const at = (v: number, from: number[], to: number[]) => {
    let i = 1;
    while (i < from.length - 1 && v > from[i]) i++;
    return to[i - 1] + ((v - from[i - 1]) * (to[i] - to[i - 1])) / (from[i] - from[i - 1]);
  };
  return { fwd: (v: number) => at(v, a, b), inv: (v: number) => at(v, b, a) };
}
function rowMap(m: Metrics) {
  const a = [0], b = [0];
  ROWY.forEach((y, r) => {
    a.push(y, y + KH);
    b.push(m.rows[r], m.rows[r] + m.kh);
  });
  a.push(KB_H);
  b.push(m.h);
  return piecewise(a, b);
}

function keyInner(k: KeyDef, up: boolean) {
  if (k.type === 'letter') return `<span>${up ? k.id.toUpperCase() : k.id}</span>`;
  if (k.id === 'shift') return up ? iconHtml('shiftOn') : iconHtml('shiftOff');
  if (k.id === 'del') return iconHtml('del');
  if (k.id === 'ret') return iconHtml('ret');
  if (k.id === '123') return '<span>123</span>';
  return '';
}

export function createKeyboard(host: HTMLElement, { live = false } = {}): Kb {
  const el = document.createElement('div');
  el.className = 'kb ' + (live ? 'live' : 'static');
  el.innerHTML = '<div class="sheet"></div>' + (live ? `<div class="siri">${iconHtml('siri')}<span>Write with Siri</span></div>` : '') +
    KEYS.map((k) => `<div class="key ${k.type}${k.id === '123' ? ' k123' : ''}" data-k="${k.id}">${keyInner(k, true)}</div>`).join('') +
    (live ? `<div class="emoji">${iconHtml('emoji')}</div><div class="mic">${iconHtml('mic')}</div>` : '') + '<div class="fx"></div>';
  host.appendChild(el);
  const keyEls: Record<string, HTMLDivElement> = {};
  el.querySelectorAll<HTMLDivElement>('.key').forEach((e) => (keyEls[e.dataset.k!] = e));
  const fx = el.querySelector<HTMLDivElement>('.fx')!;
  const Y0 = live ? 0 : 44, Y1 = live ? 300 : 262;
  // static maps scale uniformly; the live keyboard keeps iOS's fixed side margins and its rows follow `metrics`
  let sx = 1, sy = 1, W = KBW, m = PRO, M = 0, ys = rowMap(PRO);
  const mapX = (x: number) => M + (x - M) * sx, mapY = (y: number) => (live ? ys.fwd(y) : (y - Y0) * sy);
  function layout() {
    W = el.clientWidth || host.clientWidth || KBW;
    if (live) {
      m = metrics(W);
      ys = rowMap(m);
      M = MARGIN;
      sx = (W - 2 * M) / (KBW - 2 * M);
      sy = m.kh / KH;
    } else sx = sy = W / KBW;
    el.style.height = live ? `calc(${m.h}px + max(7px, env(safe-area-inset-bottom, 0px)))` : (Y1 - Y0) * sy + 'px';
    for (const k of KEYS) {
      const e = keyEls[k.id], s = e.style;
      s.left = mapX(k.x) + 'px';
      s.top = mapY(k.y) + 'px';
      s.width = k.w * sx + 'px';
      s.height = mapY(k.y + k.h) - mapY(k.y) + 'px';
      if (!live) {
        s.borderRadius = 8.5 * sy + 'px';
        const sp = e.querySelector('span');
        if (sp) sp.style.fontSize = (k.id === '123' ? 18.5 : 22.5) * sy + 'px';
        const g = e.querySelector('svg');
        if (g) g.style.transform = `scale(${sy})`;
      }
    }
    if (live) {
      const si = el.querySelector<HTMLElement>('.siri')!;
      si.style.top = '13.7px';
      si.style.height = '20px';
      const em = el.querySelector<HTMLElement>('.emoji')!;
      em.style.left = EMOJI_C.x - 13.5 + 'px';
      em.style.top = m.emojiY - 13.5 + 'px';
      const mi = el.querySelector<HTMLElement>('.mic')!;
      mi.style.left = W - (KBW - MIC_C.x) - 9.15 + 'px';
      mi.style.top = m.micY - 10.35 + 'px';
    }
  }
  function toKb(cx: number, cy: number) {
    const r = el.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    return { x: (x - M) / sx + M, y: live ? ys.inv(y) : y / sy + Y0 };
  }
  const toPx = (x: number, y: number) => ({ x: mapX(x), y: mapY(y) });
  let shiftSt: ShiftState | null = null;
  function setShift(st: ShiftState) {
    if (st === shiftSt) return;
    shiftSt = st;
    const on = st !== 'off';
    el.classList.toggle('lower', !on);
    keyEls.shift.innerHTML = st === 'caps' ? iconHtml('shiftCaps') : on ? iconHtml('shiftOn') : iconHtml('shiftOff');
    for (const c of LETTERS) keyEls[c].firstChild!.textContent = on ? c.toUpperCase() : c;
  }
  function popup(k: string) {
    const key = KEY[k];
    if (!key || key.type !== 'letter') return null;
    const kx = mapX(key.x), ky = mapY(key.y), kw = key.w * sx, kh = mapY(key.y + key.h) - ky;
    const ex = 11 * Math.min(1, sx), bw = kw + 2 * ex, bh = 52;
    const bx = clamp(kx - ex, 1, W - 1 - bw);
    const by = ky - 60, nt = by + bh, r = 10, rk = 8.5;
    const d = `M${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${nt - 6}C${bx + bw},${nt + 8} ${kx + kw},${ky + 2} ${kx + kw},${ky + 12}V${ky + kh - rk}Q${kx + kw},${ky + kh} ${kx + kw - rk},${ky + kh}H${kx + rk}Q${kx},${ky + kh} ${kx},${ky + kh - rk}V${ky + 12}C${kx},${ky + 2} ${bx},${nt + 8} ${bx},${nt - 6}V${by + r}Q${bx},${by} ${bx + r},${by}Z`;
    const p = document.createElement('div');
    p.className = 'popup';
    p.style.cssText = `left:0;top:0;width:${W}px;height:${el.clientHeight}px`;
    p.innerHTML = `<svg width="${W}" height="${Y1}" style="position:absolute;left:0;top:0;overflow:visible"><path d="${d}"/></svg><b style="top:${by + bh / 2 - 17}px;left:${bx}px;width:${bw}px;right:auto">${shiftSt !== 'off' ? k.toUpperCase() : k}</b>`;
    fx.appendChild(p);
    return p;
  }
  function flashBad(k: string) {
    const e = keyEls[k];
    if (!e) return;
    e.classList.remove('flashbad');
    void e.offsetWidth;
    e.classList.add('flashbad');
  }
  return { el, keyEls, layout, toKb, toPx, setShift, popup, flashBad, get sx() { return sx; }, get sy() { return sy; } };
}

/** Pointer handling for the live keyboard: a tap commits on release, and a new touch commits the one still held. */
export function attachInput(kb: Kb, onCommit: (key: string, down: Point) => void) {
  type Active = { down: Point; key: string; pop: HTMLDivElement | null };
  const act = new Map<number, Active>(), el = kb.el;
  const stop = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  el.addEventListener('touchstart', stop, { passive: false });
  el.addEventListener('touchmove', stop, { passive: false });
  el.addEventListener('touchend', stop, { passive: false });
  function press(a: Active) {
    const k = a.key;
    if (KEY[k] && KEY[k].type === 'letter') a.pop = kb.popup(k);
    else if (kb.keyEls[k]) kb.keyEls[k].classList.add('down');
  }
  function release(a: Active) {
    if (a.pop) {
      a.pop.remove();
      a.pop = null;
    }
    if (kb.keyEls[a.key]) kb.keyEls[a.key].classList.remove('down');
  }
  function finish(id: number, a: Active) {
    act.delete(id);
    release(a);
    onCommit(a.key, a.down);
  }
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    for (const [id, a] of [...act]) finish(id, a);
    const p = kb.toKb(e.clientX, e.clientY);
    const a: Active = { down: p, key: hitTest(p.x, p.y), pop: null };
    act.set(e.pointerId, a);
    press(a);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  el.addEventListener('pointermove', (e) => {
    const a = act.get(e.pointerId);
    if (!a) return;
    const p = kb.toKb(e.clientX, e.clientY), k = hitTest(p.x, p.y);
    if (k !== a.key) {
      release(a);
      a.key = k;
      press(a);
    }
  });
  el.addEventListener('pointerup', (e) => {
    const a = act.get(e.pointerId);
    if (a) finish(e.pointerId, a);
  });
  el.addEventListener('pointercancel', (e) => {
    const a = act.get(e.pointerId);
    if (a) {
      act.delete(e.pointerId);
      release(a);
    }
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
