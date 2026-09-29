/* Keyboard geometry in points, measured from a 402pt-wide iPhone screenshot (iOS 26). */
export const KBW = 402, KH = 43, ROWY = [51, 105, 159, 213], PITCH = 39.48, KW = 33.33, GAPY = 5.5;

export type KeyType = 'letter' | 'mod' | 'space';
export interface KeyDef {
  id: string; type: KeyType; row: number;
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  zx0: number; zx1: number; zy0: number; zy1: number;
}
export const KEYS: KeyDef[] = [];
export const KEY: Record<string, KeyDef> = {};
function addKey(o: Pick<KeyDef, 'id' | 'type' | 'row' | 'x' | 'y' | 'w' | 'h'>) {
  const k: KeyDef = { ...o, cx: o.x + o.w / 2, cy: o.y + o.h / 2, zx0: 0, zx1: 0, zy0: 0, zy1: 0 };
  KEYS.push(k);
  KEY[k.id] = k;
}
'qwertyuiop'.split('').forEach((c, i) => addKey({ id: c, type: 'letter', row: 0, x: 6.67 + i * PITCH, y: ROWY[0], w: KW, h: KH }));
'asdfghjkl'.split('').forEach((c, i) => addKey({ id: c, type: 'letter', row: 1, x: 26.33 + i * PITCH, y: ROWY[1], w: KW, h: KH }));
addKey({ id: 'shift', type: 'mod', row: 2, x: 6.67, y: ROWY[2], w: 45.33, h: KH });
'zxcvbnm'.split('').forEach((c, i) => addKey({ id: c, type: 'letter', row: 2, x: 65.67 + i * PITCH, y: ROWY[2], w: KW, h: KH }));
addKey({ id: 'del', type: 'mod', row: 2, x: 350, y: ROWY[2], w: 45.33, h: KH });
addKey({ id: '123', type: 'mod', row: 3, x: 6.67, y: ROWY[3], w: 92.33, h: KH });
addKey({ id: 'space', type: 'space', row: 3, x: 105.67, y: ROWY[3], w: 190.67, h: KH });
addKey({ id: 'ret', type: 'mod', row: 3, x: 303, y: ROWY[3], w: 92.33, h: KH });
// touch zones fill the gaps between keys, like iOS does
for (let r = 0; r < 4; r++) {
  const row = KEYS.filter((k) => k.row === r).sort((a, b) => a.x - b.x);
  row.forEach((k, i) => {
    k.zx0 = i ? (row[i - 1].x + row[i - 1].w + k.x) / 2 : 0;
    k.zx1 = i < row.length - 1 ? (k.x + k.w + row[i + 1].x) / 2 : KBW;
    k.zy0 = r ? ROWY[r] - GAPY : 38;
    k.zy1 = r < 3 ? ROWY[r] + KH + GAPY : 264;
  });
}
export const EMOJI_C = { x: 42.3, y: 287 }, MIC_C = { x: 359.2, y: 282 };
export function hitTest(x: number, y: number): string {
  if (y < 38) return 'siri';
  if (y >= 264) {
    if (Math.hypot(x - EMOJI_C.x, y - EMOJI_C.y) < 28) return 'emoji';
    if (Math.hypot(x - MIC_C.x, y - MIC_C.y) < 28) return 'mic';
    return 'none';
  }
  for (const k of KEYS) if (x >= k.zx0 && x < k.zx1 && y >= k.zy0 && y < k.zy1) return k.id;
  return 'none';
}
export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const TRAINABLE = [...LETTERS, 'space', 'shift'];
export const glyph = (k: string) => (k === 'space' ? '␣' : k === 'shift' ? '⇧' : k.toUpperCase());
const NAMES: Record<string, string> = { space: 'Space', shift: 'Shift', del: 'Delete', '123': '123', ret: 'Return', emoji: 'Emoji', mic: 'Dictation', siri: 'Siri bar', none: 'Gap' };
export const lab = (k: string) => NAMES[k] || (k || '').toUpperCase();
// B goes to the left thumb, matching the usual split (T, G, V, B left; Y, H, N right)
export const LEFT = new Set([...'qwertasdfgzxcvb', 'shift']), RIGHT = new Set('yuiophjklnm'), HANDOFF = new Set('tygbhvn'), EDGE = new Set([...'qazpl', 'shift']);
export function edist(dx: number, dy: number, key: KeyDef) {
  return Math.hypot(dx / (key.w / 2), dy / (key.h / 2));
}
export type Quality = 'bull' | 'good' | 'edge';
export function quality(dx: number, dy: number, key: KeyDef): Quality {
  const d = edist(dx, dy, key);
  return d < 0.4 ? 'bull' : d < 0.75 ? 'good' : 'edge';
}
export const focusCode = (k: string) => (k === 'space' ? '_' : k === 'shift' ? '^' : k);
