/*
 * Offline cache for FTL Arena.
 * - /assets/* (the player's own extracted FTL art, sound and fonts): cache first. They only change when the
 *   player re-extracts, and the page clears this cache when the manifest's extractedAt changes.
 * - Everything else (the app's own code and pages): network first, so a rebuild is picked up at once; the
 *   cached copy is only used when the server can't be reached.
 * Media range requests (audio streaming) pass straight through.
 */
const ASSETS = "ftl-arena-assets";
const CODE = "ftl-arena-code";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/ws")) return;
  if (url.pathname === "/assets/manifest.json") e.respondWith(networkFirst(req, ASSETS));
  else if (url.pathname.startsWith("/assets/")) e.respondWith(cacheFirst(req, ASSETS));
  else e.respondWith(networkFirst(req, CODE));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
