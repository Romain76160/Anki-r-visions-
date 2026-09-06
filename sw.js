const CACHE='mooc-revision-v9';
const ASSETS=[
  './',
  './index.html?v=9',
  './styles.css?v=9',
  './app-v2.js?v=9',
  './app.js?v=9',
  './manifest.webmanifest?v=9',
  './starter_questions.json?v=9',
  './python_types_extra.json?v=9',
  './probabilities_extra.json?v=9',
  './statistics_extra.json?v=9',
  './linear_algebra_extra.json?v=9',
  './databases_extra.json?v=9',
  './linux_extra.json?v=9',
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
