// Offline strategy: each launch asks the server for the latest page (skipping the browser's HTTP cache, which
// GitHub Pages sets to 10 minutes), but falls back to the cached copy after a short wait, so a stalled
// connection (plane or hotel Wi-Fi) never blocks launch. Other assets open from the cache and refresh in the background.
// The cache version and precache list are filled in at build time (see vite.config.ts)
const CACHE='dead-center-__VERSION__';
const CORE=__PRECACHE__;
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
    const late=new Promise(res=>setTimeout(res,NAV_TIMEOUT)).then(cached).then(r=>r&&{r,stale:true});
    e.respondWith(Promise.race([fresh.then(r=>({r})),late]).then(x=>{
      // served the saved copy because the network was slow: if the page that arrives later differs, offer a reload
      if(x&&x.stale){const was=x.r.clone().text();e.waitUntil(Promise.all([was,net]).then(async([o,n])=>{if(n.ok&&await n.clone().text()!==o)await notify(e.resultingClientId)}).catch(()=>{}))}
      return(x&&x.r)||fresh;
    }));
    return;
  }
  const net=refresh(req);e.waitUntil(net.catch(()=>{}));
  e.respondWith(caches.match(req).then(hit=>hit||net));
});
// the page asks for a check when it returns to the foreground, since iOS resumes a home screen app without reloading it
self.addEventListener('message',e=>{
  if(!e.data||e.data.type!=='check')return;
  e.waitUntil(pageChanged().then(ch=>{if(ch&&e.source)e.source.postMessage({type:'update-ready'})}).catch(()=>{}));
});
async function pageChanged(){
  const c=await caches.open(CACHE),old=await c.match('./index.html');
  const r=await fetch('./index.html',{cache:'no-cache'});if(!r.ok)return false;
  const txt=await r.clone().text();await c.put('./index.html',r);
  return!!old&&txt!==await old.text();
}
async function notify(id){
  for(let i=0;i<10;i++){const c=id&&await self.clients.get(id);if(c){c.postMessage({type:'update-ready'});return}await new Promise(r=>setTimeout(r,500))}
}
