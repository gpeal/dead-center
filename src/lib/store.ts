import { useSyncExternalStore } from 'react';
import { IN_FRAME } from './util';
import { makeSample } from './sample';

/* ================= types ================= */
// a tap as stored: [session id, target key, key hit, dx*10, dy*10, previous char, ms since previous tap]
export type TapRow = [number, string, string, number, number, string, number];
export interface Tap { sid: number; k: string; h: string; dx: number; dy: number; p: string; dt: number }
export type Mode = 'baseline' | 'round' | 'drill';
export interface Session {
  id: number; ts: number; mode: Mode; focus: string; n: number; hits: number; acc: number;
  prec?: number; wpm?: number; combo?: number; bull?: number; dur?: number; caseSlips?: number; realigns?: number; partial?: boolean;
}
/** half: the recency half-life, in taps per key (see statsFor in analysis.ts). */
export interface Settings { sound: boolean; haptics: boolean; dots: boolean; len: number; half: number }
export interface State {
  v: number; taps: TapRow[]; sessions: Session[];
  used: number[]; bests: { wpm: number; combo: number };
  settings: Settings; tapBase: number; rev: number;
}
export interface Dataset { taps: Tap[]; sessions: Session[]; sample: boolean }

/* ================= storage ================= */
const STORE_KEY = 'deadcenter.v1';
export const CHUNK = 2000, CAP = 40000;
export function fresh(): State {
  return { v: 1, taps: [], sessions: [], used: [], bests: { wpm: 0, combo: 0 }, settings: { sound: true, haptics: true, dots: true, len: 3, half: 30 }, tapBase: 0, rev: 0 };
}
export function hydrate(raw: any): State {
  const f = fresh();
  const o = JSON.parse(JSON.stringify(raw || {}));
  // achievements, score, XP, the daily goal and streaks were removed
  delete o.ach;
  delete o.streak;
  delete o.daily;
  delete o.xp;
  if (Array.isArray(o.sessions)) for (const s of o.sessions) delete s.score;
  return Object.assign(f, o, {
    taps: Array.isArray(o.taps) ? o.taps : [], sessions: Array.isArray(o.sessions) ? o.sessions : [],
    tapBase: o.tapBase || 0, rev: o.rev || 0,
    settings: Object.assign(f.settings, o.settings || {}),
    bests: Object.assign(f.bests, o.bests || {}),
  });
}
export let storageOK = true;
/* Guest mode lets someone else play on this phone: their rounds go into a separate, temporary profile (GUEST_KEY) that
   never syncs and is deleted when guest mode is turned off, so the owner's rounds and stats are untouched. */
const GUEST_FLAG = 'dc.guest', GUEST_KEY = 'deadcenter.guest';
function readGuest() {
  try {
    return localStorage.getItem(GUEST_FLAG) === '1';
  } catch {
    return false;
  }
}
let guest = readGuest();
export const isGuest = () => guest;
const activeKey = () => (guest ? GUEST_KEY : STORE_KEY);
function load(): State {
  try {
    localStorage.setItem('dc.test', '1');
    localStorage.removeItem('dc.test');
    const raw = localStorage.getItem(activeKey());
    if (raw) return hydrate(JSON.parse(raw));
  } catch {
    storageOK = false;
  }
  return fresh();
}

/** The one mutable state object. Mutate it, then call save() (or emit() for non-persisted changes). */
export const store: { S: State } = { S: load() };

let version = 0;
const listeners = new Set<() => void>();
export function emit() {
  TAPS = null;
  SAMPLE = null;
  version++;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
/** Re-render when the store changes; returns a version number usable as a memo dependency. */
export const useStore = () => useSyncExternalStore(subscribe, () => version);

function saveLocal() {
  try {
    localStorage.setItem(activeKey(), JSON.stringify(store.S));
    storageOK = true;
  } catch {
    storageOK = false;
  }
}
export function save(full?: boolean) {
  store.S.rev = Date.now();
  saveLocal();
  if (!guest) cloudPush(!!full);
  emit();
}
/** Turns guest mode on (a fresh, separate profile) or off (back to your own; the guest's rounds are deleted). */
export function setGuest(on: boolean) {
  if (on === guest) return;
  try {
    if (on) localStorage.setItem(GUEST_FLAG, '1');
    else {
      localStorage.removeItem(GUEST_FLAG);
      localStorage.removeItem(GUEST_KEY);
    }
  } catch {
    /* ignore */
  }
  guest = on;
  store.S = load();
  emit();
}
export function replaceState(next: State) {
  store.S = next;
  save(true);
}
try {
  navigator.storage?.persist?.().catch(() => {});
} catch {
  /* ignore */
}

/* ================= derived data ================= */
let TAPS: Tap[] | null = null;
let SAMPLE: Dataset | null = null;
export const toObj = (a: TapRow): Tap => ({ sid: a[0], k: a[1], h: a[2], dx: a[3] / 10, dy: a[4] / 10, p: a[5], dt: a[6] });
export function allTaps() {
  if (!TAPS) TAPS = store.S.taps.map(toObj);
  return TAPS;
}
export const realSessions = () => store.S.sessions.filter((s) => !s.partial);
export function dataset(): Dataset {
  // guests start blank: example data is only for a new owner before their first rounds
  if (store.S.taps.length >= 40 || guest) return { taps: allTaps(), sessions: realSessions(), sample: false };
  return SAMPLE || (SAMPLE = makeSample());
}
export function commitTaps(taps: TapRow[]) {
  const S = store.S;
  S.taps.push(...taps);
  if (S.taps.length > CAP) {
    const k = Math.ceil((S.taps.length - CAP) / CHUNK) * CHUNK;
    S.taps = S.taps.slice(k);
    S.tapBase = (S.tapBase || 0) + k;
  }
}

/* ================= account sync: each person's private folder in the page's database =================
   iPhone wipes storage for pages embedded from another site when the app closes, so progress also lives
   server-side under data/users/<id>/, readable only by that person. Taps are split into 2,000-tap chunks. */
export type SyncState = 'loading' | 'off' | 'on' | 'denied' | 'error';
type Db = any;
const SYNC: { db: Db; uid: string | null; state: SyncState; pushedTotal: number; cloudChunks: string[]; queue: Promise<void>; dirtyAll: boolean } = {
  db: null, uid: null, state: IN_FRAME ? 'loading' : 'off', pushedTotal: 0, cloudChunks: [], queue: Promise.resolve(), dirtyAll: false,
};
export const syncState = () => SYNC.state;
const setSync = (s: SyncState) => {
  SYNC.state = s;
  emit();
};
const chunkId = (i: number) => 'c' + String(i).padStart(6, '0');
const profRef = () => SYNC.db.doc('data/users/' + SYNC.uid + '/profile');
const chunksCol = () => profRef().collection('taps');
function cloudPush(full: boolean) {
  if (!SYNC.db || !SYNC.uid || SYNC.state === 'denied') return;
  if (full) SYNC.dirtyAll = true;
  SYNC.queue = SYNC.queue
    .then(async () => {
      const S = store.S;
      const base = S.tapBase || 0, total = base + S.taps.length, first = Math.floor(base / CHUNK), last = Math.floor((total - 1) / CHUNK);
      const from = SYNC.dirtyAll ? first : Math.max(first, Math.floor(Math.min(SYNC.pushedTotal, total) / CHUNK));
      for (let c = from; c <= last; c++) {
        const s = c * CHUNK - base;
        await chunksCol().doc(chunkId(c)).set({ t: S.taps.slice(s, s + CHUNK) });
      }
      const keep = new Set<string>();
      for (let c = first; c <= last; c++) keep.add(chunkId(c));
      for (const id of SYNC.cloudChunks) if (!keep.has(id)) await chunksCol().doc(id).delete();
      SYNC.cloudChunks = [...keep];
      const { taps: _taps, ...rest } = S;
      await profRef().set({ state: rest, tapBase: base, total, rev: S.rev || 0 });
      SYNC.pushedTotal = total;
      SYNC.dirtyAll = false;
      setSync('on');
    })
    .catch((e) => {
      SYNC.dirtyAll = true;
      setSync(e && e.code === 'invalid_argument' ? 'denied' : 'error');
    });
}
function mergeStates(base: State, other: State) {
  // keep everything from the newer copy, then add rounds (and their taps) that only the other copy has
  const ids = new Set(base.sessions.map((s) => s.id)), extra = other.sessions.filter((s) => !ids.has(s.id));
  if (!extra.length) return { s: base, changed: false };
  const sids = new Set(extra.map((s) => s.id));
  base.sessions = [...base.sessions, ...extra].sort((a, b) => a.id - b.id);
  base.taps = [...base.taps, ...other.taps.filter((t) => sids.has(t[0]))].sort((a, b) => a[0] - b[0]);
  base.bests = { wpm: Math.max(base.bests.wpm, other.bests.wpm), combo: Math.max(base.bests.combo, other.bests.combo) };
  if (base.taps.length > CAP) {
    const k = Math.ceil((base.taps.length - CAP) / CHUNK) * CHUNK;
    base.taps = base.taps.slice(k);
    base.tapBase = (base.tapBase || 0) + k;
  }
  return { s: base, changed: true };
}
export async function cloudInit() {
    const claude = (window as any).claude;
  if (guest || !claude || typeof claude.use !== 'function') return setSync('off'); // guests never sync
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) return setSync('off');
    SYNC.db = db;
    SYNC.uid = uid;
    const snap = await profRef().get();
    if (!snap.exists) {
      setSync('on');
      if (store.S.sessions.length || store.S.taps.length) cloudPush(true);
      return;
    }
    const d = snap.data(), q = await chunksCol().get();
        SYNC.cloudChunks = q.docs.map((x: any) => x.id);
    const first = Math.floor((d.tapBase || 0) / CHUNK), taps: TapRow[] = [];
    q.docs
            .filter((x: any) => parseInt(x.id.slice(1), 10) >= first)
            .sort((a: any, b: any) => (a.id < b.id ? -1 : 1))
            .forEach((x: any) => {
        const t = x.data().t;
        if (Array.isArray(t)) taps.push(...t);
      });
    const cloud = hydrate(Object.assign({}, d.state, { taps, tapBase: d.tapBase || 0, rev: d.rev || 0 }));
    const local = store.S, localHas = local.sessions.length > 0;
    let next = cloud, changed = false;
    if (localHas) {
      const newer = (local.rev || 0) > (cloud.rev || 0);
      const m = newer ? mergeStates(local, cloud) : mergeStates(cloud, local);
      next = m.s;
      changed = newer || m.changed;
    }
    store.S = next;
    SYNC.pushedTotal = (next.tapBase || 0) + next.taps.length;
    saveLocal();
    setSync('on');
    if (changed) cloudPush(true);
  } catch {
    setSync('error');
  }
}
// give up waiting on the account after a while so the first screen is not stuck on "Loading"
setTimeout(() => {
  if (SYNC.state === 'loading') setSync('off');
}, 9000);
