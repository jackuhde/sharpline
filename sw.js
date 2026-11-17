/* Sharpline service worker: the app shell and reader work offline; lines always come fresh from the network. */
const CACHE="sharpline-v3";
const SHELL=["./","index.html","ocrparse.js","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  if(u.pathname.endsWith("data.json")){e.respondWith(fetch(e.request).catch(()=>caches.match("data.json",{ignoreSearch:true})));return}
  if(u.pathname.includes("/vendor/")){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cl=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));return res})));return}
  e.respondWith(fetch(e.request).then(res=>{const cl=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cl));return res}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
