// Offline strategy: each launch asks the server for the latest page (skipping the browser's HTTP cache, which
// GitHub Pages sets to 10 minutes), but falls back to the cached copy after a short wait, so a stalled
// connection (plane or hotel Wi-Fi) never blocks launch. Other assets open from the cache and refresh in the background.
const CACHE='dead-center-v4';
const CORE=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
const NAV_TIMEOUT=2500;
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const sameOrigin=req=>new URL(req.url).origin===self.location.origin;
function refresh(req,key){return fetch(req,sameOrigin(req)?{cache:'no-cache'}:undefined).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(key||req,cp))}return r})}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  if(req.mode==='navigate'){
    const cached=()=>caches.match('./index.html');
    const net=refresh(new Request('./index.html'),'./index.html');
    e.waitUntil(net.catch(()=>{}));
    const fresh=net.then(r=>r.ok?r:cached().then(c=>c||r),()=>cached());
    const late=new Promise(res=>setTimeout(res,NAV_TIMEOUT)).then(cached);
    e.respondWith(Promise.race([fresh,late]).then(r=>r||fresh));
    return;
  }
  const net=refresh(req);e.waitUntil(net.catch(()=>{}));
  e.respondWith(caches.match(req).then(hit=>hit||net));
});
