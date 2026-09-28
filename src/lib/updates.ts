import { useSyncExternalStore } from 'react';

/* The service worker (src/sw.js) keeps the app working offline. iOS resumes a home screen app without reloading
   it, so the page asks the worker to check for a new version when it returns to the foreground. */
let ready = false;
const listeners = new Set<() => void>();
function setReady() {
  if (ready) return;
  ready = true;
  listeners.forEach((l) => l());
}
export const useUpdateReady = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => ready);

export function watchUpdates() {
  const sw = navigator.serviceWorker, hadCtl = !!sw.controller;
  let last = Date.now();
  sw.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'update-ready') setReady();
  });
  sw.addEventListener('controllerchange', () => {
    if (hadCtl) setReady(); // a new service worker took over
  });
  sw.register('sw.js')
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - last < 60e3) return;
        last = Date.now();
        reg.update().catch(() => {});
        sw.controller?.postMessage({ type: 'check' });
      });
    })
    .catch(() => {});
}
