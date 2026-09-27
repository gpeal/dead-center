// Offline strategy: open instantly from the cache, refresh it in the background.
// A stalled connection (plane or hotel Wi-Fi) never blocks launch; new versions apply on the next launch.
const CACHE='dead-center-v3';
const CORE=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function refresh(req,key){return fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(key||req,cp))}return r})}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  if(req.mode==='navigate'){
    const net=refresh(req,'./index.html');
    e.waitUntil(net.catch(()=>{}));
    e.respondWith(caches.match('./index.html').then(hit=>hit||net).catch(()=>net));
    return;
  }
  const net=refresh(req);e.waitUntil(net.catch(()=>{}));
  e.respondWith(caches.match(req).then(hit=>hit||net));
});
