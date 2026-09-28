import { useSyncExternalStore } from 'react';
import { store } from './store';
import { cssVar, reduceMotion } from './util';
import type { IconName } from '../components/Icon';

/* ================= sound + haptics ================= */
let AC: AudioContext | null = null, NB: AudioBuffer | null = null;
export type SoundKind = 'key' | 'mod' | 'miss' | 'chime';
export function sound(kind: SoundKind) {
  if (!store.S.settings.sound) return;
  try {
    AC = AC || new (window.AudioContext || (window as any).webkitAudioContext)();
    const ac = AC!;
    if (ac.state === 'suspended') ac.resume();
    if (!NB) {
      NB = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.04), ac.sampleRate);
      const d = NB.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 5);
    }
    const t = ac.currentTime, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = NB;
    f.type = 'bandpass';
    f.frequency.value = kind === 'mod' ? 1500 : kind === 'miss' ? 700 : 3300;
    f.Q.value = 1.1;
    g.gain.value = kind === 'miss' ? 0.55 : 0.4;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
    if (kind === 'miss') {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
      og.gain.setValueAtTime(0.18, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.11);
    }
    if (kind === 'chime') {
      [660, 880, 1320].forEach((fr, i) => {
        const o = ac.createOscillator(), og = ac.createGain();
        o.frequency.value = fr;
        og.gain.setValueAtTime(0, t + i * 0.08);
        og.gain.linearRampToValueAtTime(0.08, t + i * 0.08 + 0.01);
        og.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.35);
        o.connect(og).connect(ac.destination);
        o.start(t + i * 0.08);
        o.stop(t + i * 0.08 + 0.4);
      });
    }
  } catch {
    /* audio is best effort */
  }
}
// Safari gives a haptic tick when a switch-style checkbox is toggled, so haptics click a hidden one
let hapt: HTMLLabelElement | null = null;
export function buzz() {
  if (!store.S.settings.haptics) return;
  try {
    if (!hapt) {
      hapt = document.createElement('label');
      hapt.className = 'hapt';
      hapt.setAttribute('aria-hidden', 'true');
      hapt.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(hapt);
    }
    hapt.click();
  } catch {
    /* ignore */
  }
}

/* ================= toasts ================= */
export interface ToastItem { id: number; icon: IconName; title: string; sub?: string }
let toasts: ToastItem[] = [], tid = 0;
const tl = new Set<() => void>();
const setToasts = (t: ToastItem[]) => {
  toasts = t;
  tl.forEach((l) => l());
};
export function toast(icon: IconName, title: string, sub?: string) {
  setToasts([...toasts, { id: ++tid, icon, title, sub }]);
}
export const dismissToast = (id: number) => setToasts(toasts.filter((t) => t.id !== id));
export const useToasts = () => useSyncExternalStore((l) => (tl.add(l), () => tl.delete(l)), () => toasts);

/* ================= confetti ================= */
export function confetti() {
  if (reduceMotion()) return;
  const cv = document.createElement('canvas');
  cv.id = 'confetti';
  document.body.appendChild(cv);
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const cols = [cssVar('--accent'), cssVar('--gold'), cssVar('--red'), cssVar('--green')];
  const ps = Array.from({ length: 130 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.32, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 13 - 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * 4)], round: Math.random() < 0.3 }));
  const t0 = performance.now();
  const f = (t: number) => {
    const e = t - t0;
    c.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.globalAlpha = Math.max(0, 1 - e / 2400);
      c.fillStyle = p.c;
      if (p.round) {
        c.beginPath();
        c.arc(0, 0, p.h, 0, 7);
        c.fill();
      } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    if (e < 2400) requestAnimationFrame(f);
    else cv.remove();
  };
  f(t0);
}
