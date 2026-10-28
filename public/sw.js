// LBL service worker — offline resilience without leaking sessions.
//
// Three separate caches, each with an EXPLICIT list of what may go in:
//  - STATIC: Next build assets (/_next/static, immutable), fonts, app icons,
//    logos and small UI icons. Cache-first.
//  - ARENA:  telão media (backgrounds, countdown/finish videos, finish art).
//    Stored ONLY when the request comes from the arena screen (/arena), so an
//    ordinary visitor never downloads or stores them. Cache-first afterwards,
//    so a prepared telão survives a connection drop.
//  - PAGES:  HTML of PUBLIC pages, and only responses the middleware marked
//    `x-lbl-cacheable: public` (request without a session, non-private path).
//    A logged-in page is never stored, so account A's screen can never be
//    shown to account B. Network-first; offline → cached public copy (flagged
//    as a saved copy) or a neutral "sem conexão" page.
//  - Live data (/api/*) and everything else: network only, never cached.
//
// Bump VERSION when a cached file is replaced under the same name; activate
// deletes every cache that doesn't belong to this version (incl. lbl-cache-v6).
const VERSION = "v7";
const STATIC = `lbl-static-${VERSION}`;
const ARENA = `lbl-arena-${VERSION}`;
const PAGES = `lbl-pages-${VERSION}`;
const KEEP = [STATIC, ARENA, PAGES];
const MAX_PAGES = 30;

// Small, always-useful assets (exact paths or prefixes).
const STATIC_FILES = [
  "/app-icon-192.png", "/app-icon-512.png", "/apple-touch-icon.png",
  "/arena-icon-180.png", "/arena-icon-512.png",
  "/lbl-logo.png", "/lbm-logo.webp", "/Slash.webp",
  "/ataque.png", "/defesa.png", "/equilibrio.png", "/resistencia.png",
];
const STATIC_PREFIXES = ["/_next/static/", "/brand/"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Telão-only media.
const ARENA_FILES = [
  "/scoreboard-bg.png", "/winner-bg.png", "/bey-removebg-preview.png",
  "/countdown.mp4", "/countdown.mp3", "/prontos.mp4", "/nosleep.mp4",
];
const ARENA_PREFIXES = ["/finish-videos/", "/finishes/"];
// What a telão downloads up front when the operator starts it.
const ARENA_WARM = [
  ...ARENA_FILES,
  "/finish-videos/SPIN_FINISH.mp4", "/finish-videos/OVER_FINISH.mp4", "/finish-videos/BURST_FINISH.mp4", "/finish-videos/EXTREME_FINISH.mp4",
  "/finishes/spin.png", "/finishes/over.png", "/finishes/burst.png", "/finishes/xtreme.png",
];

// Pages that depend on the session: never cached; offline → neutral page.
const PRIVATE_PREFIXES = ["/dashboard", "/profile", "/admin", "/juiz", "/arena", "/tournaments/create", "/test-tournaments", "/beyparts", "/verify-email", "/reset-password"];
const isPrivatePath = (p) =>
  PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(x + "/")) || /^\/tournaments\/[^/]+\/(edit|certificates)(\/|$)/.test(p);

const inList = (p, files, prefixes) => files.includes(p) || prefixes.some((x) => p.startsWith(x));

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Logout (or account switch): drop stored pages. Static and arena media hold
// nothing personal; quick tournaments live in localStorage and are untouched.
self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "lbl:logout") event.waitUntil(caches.delete(PAGES));
  if (type === "lbl:warm-arena") event.waitUntil(warmArena(event.data.extra));
});

// Full (non-range) downloads, so videos can be replayed offline.
async function warmArena(extra) {
  const c = await caches.open(ARENA);
  const custom = (Array.isArray(extra) ? extra : [])
    .filter((u) => typeof u === "string" && u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/api/"))
    .slice(0, 4);
  await Promise.allSettled([...ARENA_WARM, ...custom].map(async (u) => {
    if (await c.match(u)) return;
    const res = await fetch(u, { cache: "no-cache" });
    if (res.status !== 200) return;
    // Read the whole file first: a cache entry can become visible while its
    // body is still streaming, and a drop mid-download would leave it broken.
    const body = await res.blob();
    await c.put(u, new Response(body, { status: 200, headers: { "Content-Type": res.headers.get("Content-Type") || "application/octet-stream", "Content-Length": String(body.size) } }));
  }));
}

// <video> asks for byte ranges; answer them from the full cached file.
async function rangeFrom(cached, rangeHeader) {
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || "");
  if (!m) return cached;
  const buf = await cached.arrayBuffer();
  const size = buf.byteLength;
  let start = m[1] ? Number(m[1]) : size - Number(m[2] || 0);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

function fromArena(req) {
  try {
    return req.referrer && new URL(req.referrer).pathname.startsWith("/arena");
  } catch { return false; }
}

async function cacheFirst(cacheName, req, store) {
  const c = await caches.open(cacheName);
  const cached = await c.match(req.url, { ignoreVary: true });
  if (cached) return req.headers.has("range") ? rangeFrom(cached, req.headers.get("range")) : cached;
  const res = await fetch(req);
  // Store only complete answers to plain requests: a <video> range request
  // may be cut short by the player, and a cache entry written from that
  // stream would be broken (videos are stored by warmArena instead). The body
  // is read in full before it is stored.
  if (store && res && res.status === 200 && !req.headers.has("range")) {
    const copy = res.clone();
    copy.blob()
      .then((body) => c.put(req.url, new Response(body, { status: 200, headers: { "Content-Type": copy.headers.get("Content-Type") || "application/octet-stream" } })))
      .catch(() => {});
  }
  return res;
}

async function trimPages(c) {
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_PAGES; i++) await c.delete(keys[i]);
}

function offlineHtml() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão · LBL</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8eaf0;font:16px system-ui,sans-serif;text-align:center;padding:16px}main{max-width:420px}h1{font-size:1.3rem}button{margin-top:12px;padding:10px 18px;border-radius:8px;border:0;background:#f5c400;color:#111;font-weight:700;font-size:1rem}</style></head>
<body><main><h1>Sem conexão</h1><p>Esta página precisa de internet para mostrar seus dados. Assim que a conexão voltar, ela abre normalmente.</p><button onclick="location.reload()">Tentar novamente</button></main>
<script>addEventListener("online",()=>location.reload())</script></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

// Mark a cached copy so the page can show "cópia salva de HH:MM".
async function markStale(res) {
  const html = await res.text();
  const savedAt = res.headers.get("x-lbl-saved-at") || "";
  const tag = `<meta name="lbl-offline-copy" content="${savedAt.replace(/[^0-9TZ:.\-]/g, "")}">`;
  return new Response(html.replace("<head>", "<head>" + tag), {
    status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function navigate(req, url) {
  const priv = isPrivatePath(url.pathname);
  try {
    const res = await fetch(req);
    if (!priv && res.status === 200 && res.headers.get("x-lbl-cacheable") === "public") {
      const headers = new Headers(res.headers);
      headers.set("x-lbl-saved-at", new Date().toISOString());
      const copy = new Response(await res.clone().blob(), { status: 200, headers });
      caches.open(PAGES).then(async (c) => { await c.put(url.pathname + url.search, copy); await trimPages(c); }).catch(() => {});
    }
    return res;
  } catch {
    if (!priv) {
      const c = await caches.open(PAGES);
      const hit = await c.match(url.pathname + url.search);
      if (hit) return markStale(hit);
    }
    return offlineHtml();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  if (same && url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate" && same) { event.respondWith(navigate(req, url)); return; }

  if (FONT_HOSTS.includes(url.hostname) || (same && inList(url.pathname, STATIC_FILES, STATIC_PREFIXES))) {
    event.respondWith(cacheFirst(STATIC, req, true));
    return;
  }

  if (same && inList(url.pathname, ARENA_FILES, ARENA_PREFIXES)) {
    // Served from the arena cache when present; stored only for the telão.
    event.respondWith(cacheFirst(ARENA, req, fromArena(req)));
  }
});
