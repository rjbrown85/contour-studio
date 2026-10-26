const CACHE='contour-studio-v3'
const ASSETS=['./','./index.html','./style.css','./app.js','./core.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest']
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))))
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('contour-studio-')&&key!==CACHE).map(key=>caches.delete(key))))))
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)))
})
