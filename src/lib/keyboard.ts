import { KEYS, KEY, KBW, LETTERS, EMOJI_C, MIC_C, hitTest, type KeyDef } from './keys';
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
  let sx = 1, sy = 1, W = KBW;
  function layout() {
    W = el.clientWidth || host.clientWidth || KBW;
    sx = W / KBW;
    sy = live ? 1 : sx;
    el.style.height = live ? 'calc(293px + max(7px, env(safe-area-inset-bottom, 0px)))' : (Y1 - Y0) * sy + 'px';
    for (const k of KEYS) {
      const e = keyEls[k.id], s = e.style;
      s.left = k.x * sx + 'px';
      s.top = (k.y - Y0) * sy + 'px';
      s.width = k.w * sx + 'px';
      s.height = k.h * sy + 'px';
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
      em.style.left = EMOJI_C.x * sx - 13.5 + 'px';
      em.style.top = EMOJI_C.y - 13.5 + 'px';
      const mi = el.querySelector<HTMLElement>('.mic')!;
      mi.style.left = MIC_C.x * sx - 9.15 + 'px';
      mi.style.top = MIC_C.y - 10.35 + 'px';
    }
  }
  function toKb(cx: number, cy: number) {
    const r = el.getBoundingClientRect();
    return { x: (cx - r.left) / sx, y: (cy - r.top) / sy + Y0 };
  }
  const toPx = (x: number, y: number) => ({ x: x * sx, y: (y - Y0) * sy });
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
    const kx = key.x * sx, ky = (key.y - Y0) * sy, kw = key.w * sx, kh = key.h * sy;
    const ex = 11 * Math.min(1, sx), bw = kw + 2 * ex, bh = 52;
    const bx = clamp(kx - ex, 1, W - 1 - bw);
    const by = ky - 60, nt = by + bh, r = 10, rk = 8.5;
    const d = `M${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${nt - 6}C${bx + bw},${nt + 8} ${kx + kw},${ky + 2} ${kx + kw},${ky + 12}V${ky + kh - rk}Q${kx + kw},${ky + kh} ${kx + kw - rk},${ky + kh}H${kx + rk}Q${kx},${ky + kh} ${kx},${ky + kh - rk}V${ky + 12}C${kx},${ky + 2} ${bx},${nt + 8} ${bx},${nt - 6}V${by + r}Q${bx},${by} ${bx + r},${by}Z`;
    const p = document.createElement('div');
    p.className = 'popup';
    p.style.cssText = `left:0;top:0;width:${W}px;height:${Y1 * sy}px`;
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
