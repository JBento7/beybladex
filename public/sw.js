// LBL service worker — offline resilience for the arena/judge devices.
// - Static assets & media (videos, images, fonts): cache-first, so the telão
//   keeps its art/videos and they never re-download on a weak connection.
// - Navigations (pages): network-first with a cached fallback, so the app still
//   opens during a drop.
// - Live data (/api/*): network-only (never cached) so scores/state stay fresh.
const CACHE = "lbl-cache-v1";

// Media that must work offline / never re-download.
const PRECACHE = [
  "/countdown.mp4",
  "/finish-videos/SPIN_FINISH.mp4",
  "/finish-videos/OVER_FINISH.mp4",
  "/finish-videos/BURST_FINISH.mp4",
  "/finish-videos/EXTREME_FINISH.mp4",
  "/nosleep.mp4",
  "/scoreboard-bg.png",
  "/winner-bg.png",
  "/bey-removebg-preview.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

function isMedia(url) {
  return /\.(mp4|png|jpg|jpeg|webp|gif|svg|woff2?|ttf|otf)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never cache live data — always hit the network.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  // Static media & Next static assets: cache-first (stale-while-revalidate).
  if ((sameOrigin && (isMedia(url) || url.pathname.startsWith("/_next/static"))) ||
      url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const cached = await c.match(req);
        const fetching = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || fetching;
      })
    );
    return;
  }

  // Page navigations: network-first, fall back to cache when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error())
    );
  }
});
