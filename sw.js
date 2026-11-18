const CACHE='ek-axis-pwa-production-20261117-v1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-192.png','./icon-maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// No skipWaiting: an update never replaces code in an open working session.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ek-axis-pwa-production-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/baseline/')||url.pathname.endsWith('/rollback.html'))return;
const shellPaths=SHELL.map(path=>new URL(path,self.registration.scope).pathname);if(!shellPaths.includes(url.pathname))return;
event.respondWith(fetch(event.request).then(response=>{if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||caches.match(new URL('./index.html',self.registration.scope)))));});
