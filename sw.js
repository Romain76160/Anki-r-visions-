const CACHE='mooc-revision-v7';
const ASSETS=[
  './',
  './index.html?v=7',
  './styles.css?v=7',
  './app-v2.js?v=7',
  './app.js?v=7',
  './manifest.webmanifest?v=7',
  './starter_questions.json?v=7',
  './python_types_extra.json?v=7',
  './probabilities_extra.json?v=7',
  './statistics_extra.json?v=7',
  './linear_algebra_extra.json?v=7',
  './databases_extra.json?v=7',
  './icon-192.png',
  './icon-512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        if(response&&response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./')))
  );
});
