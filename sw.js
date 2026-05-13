const CACHE = "senyaspo-v4";

const ASSETS = [
  "/",
  "/index.html",
  "/data/stops.json",
  "/data/routes.json",
  "/js/data.js",
  "/js/fare.js",
  "/js/gps.js",
  "/js/phrases.js",
  "/js/ai.js",
  "/js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // AI assistant requests always go to network
  if (e.request.url.includes("/api/")) return;

  // Network-first for JS, CSS, HTML, and JSON files; cache fallback
  if (e.request.url.match(/\.(js|css|json|html)$/)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for everything else; cache fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});