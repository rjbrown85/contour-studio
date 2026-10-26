const CACHE='contour-studio-v4'
const ASSETS=['./','./index.html','./style.css?v=4','./app.js?v=4','./core.js?v=4','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest']
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
))
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(key=>key.startsWith('contour-studio-')&&key!==CACHE).map(key=>caches.delete(key)))
  await self.clients.claim()
})()))
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url)
  if(request.method!=='GET'||!url.href.startsWith(self.registration.scope))return
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE)
    // Fetch the page on every visit. Offline visits use the last successful copy.
    if(request.mode==='navigate'){
      try{
        const response=await fetch(request,{cache:'no-cache'})
        if(response.ok){await cache.put('./index.html',response.clone());return response}
        return await cache.match('./index.html')||response
      }catch{
        const fallback=await cache.match('./index.html')
        return fallback||new Response('Contour Studio could not load. Reconnect and reload.',{status:503})
      }
    }
    // Versioned assets keep the page, drawing code and styles on the same release.
    const cached=await cache.match(request)
    if(cached)return cached
    const response=await fetch(request)
    if(response.ok)await cache.put(request,response.clone())
    return response
  })())
})
