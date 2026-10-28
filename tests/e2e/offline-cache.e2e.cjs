// Offline cache (public/sw.js) end-to-end checks, in a real browser.
//   BASE=http://localhost:3200 USER_A=a@x.test USER_B=b@x.test ARENA_USER=arena1@lbl.arena PASSWORD=... \
//     node tests/e2e/offline-cache.e2e.cjs
// Run against a LOCAL server with a disposable database — never production.
// Scenarios: first public visit without arena media · public page offline
// (saved copy, flagged) · private page offline (neutral screen) · logged-in
// pages never stored · logout clears stored pages · account A→B · prepared
// telão · service worker version update.
// Without this flag Playwright's offline mode does not reach the service worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
let playwright;
try { playwright = require("playwright"); } catch { playwright = require("/opt/node22/lib/node_modules/playwright"); }
const assert = require("node:assert/strict");

const BASE = process.env.BASE || "http://localhost:3200";
const A = process.env.USER_A, B = process.env.USER_B, PASSWORD = process.env.PASSWORD;
const ARENA = process.env.ARENA_USER; // an arenaN@<liga>.arena account (same PASSWORD); optional
if (!A || !B || !PASSWORD) { console.error("USER_A, USER_B and PASSWORD are required"); process.exit(2); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("Refusing to run against a non-local server:", BASE); process.exit(2); }

const results = [];
async function step(name, fn) {
  try { await fn(); results.push(["ok", name]); console.log("ok  -", name); }
  catch (e) { results.push(["FAIL", name]); console.log("FAIL-", name, "\n     ", String(e.message || e).split("\n")[0]); }
}
const cacheState = (page) => page.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
  return out;
});
// page.waitForFunction treats an async predicate's Promise as "true" right
// away, so poll explicitly.
async function until(page, fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await page.evaluate(fn)) return; await page.waitForTimeout(250); }
  throw new Error("timed out waiting for condition");
}
const swReady = (page) => page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
async function waitControlled(page) {
  await swReady(page);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload({ waitUntil: "load" });
}
async function login(page, email) {
  await page.goto(BASE + "/login", { waitUntil: "load" }).catch(() => page.goto(BASE + "/login", { waitUntil: "load" }));
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), page.click('button[type="submit"]')]);
}
async function logoutViaUi(page) {
  // Same code path as the Sair buttons (lib/client/logout).
  await page.goto(BASE + "/tournaments", { waitUntil: "load" });
  await page.locator('button[aria-haspopup="menu"]:visible').first().click();
  const sair = page.locator('[role="menu"]').getByText("Sair", { exact: true });
  await Promise.all([page.waitForURL((u) => u.pathname === "/" || u.pathname === "/login", { timeout: 15000 }), sair.click()]);
}

(async () => {
  const browser = await playwright.chromium.launch();

  // 1-3: visitor
  {
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();
    const media = [];
    ctx.on("request", (r) => { if (/\.(mp4|mp3)$|scoreboard-bg|winner-bg|finish-videos/.test(r.url())) media.push(r.url()); });
    await page.goto(BASE + "/", { waitUntil: "load" });
    await waitControlled(page);
    await page.goto(BASE + "/tournaments", { waitUntil: "load" });
    await page.waitForTimeout(1500);

    await step("first public visit downloads/stores no arena media", async () => {
      const c = await cacheState(page);
      assert.equal(media.length, 0, "arena media requested: " + media.join(", "));
      assert.ok(!Object.keys(c).some((k) => k.startsWith("lbl-arena-") && c[k].length), "arena cache not empty");
      assert.ok(!Object.keys(c).includes("lbl-cache-v6"), "old cache kept");
    });
    await step("public page stored for offline use (visitor only)", async () => {
      const c = await cacheState(page);
      const pages = c[Object.keys(c).find((k) => k.startsWith("lbl-pages-"))] || [];
      assert.ok(pages.includes("/tournaments"), "stored pages: " + pages.join(", "));
    });
    await ctx.setOffline(true);
    await step("public page offline → saved copy, flagged as possibly outdated", async () => {
      await page.goto(BASE + "/tournaments", { waitUntil: "load" });
      assert.ok(await page.locator('meta[name="lbl-offline-copy"]').count(), "no offline marker");
      await page.getByText(/Cópia salva de/).waitFor({ timeout: 5000 });
    });
    await step("private page offline → neutral screen", async () => {
      await page.goto(BASE + "/dashboard", { waitUntil: "load" });
      // A visitor gets the neutral screen, or the saved PUBLIC login page the
      // private route redirects to — never anything personal.
      const text = await page.locator("body").innerText();
      assert.ok(/Sem conexão/.test(text), "got: " + text.slice(0, 120));
      assert.ok(/precisa de internet/.test(text) || new URL(page.url()).pathname === "/login", "unexpected page " + page.url());
      assert.ok(!/Bem-vindo, /.test(text));
    });
    await ctx.close();
  }

  // 4-6: accounts
  {
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });
    await waitControlled(page);
    await login(page, A);
    await page.goto(BASE + "/dashboard", { waitUntil: "load" });
    const nameA = (await page.locator("h1").first().innerText()).trim();
    await page.goto(BASE + "/tournaments?status=anteriores", { waitUntil: "load" });
    await page.waitForTimeout(800);

    await step("logged-in pages are never stored", async () => {
      const c = await cacheState(page);
      const pages = c[Object.keys(c).find((k) => k.startsWith("lbl-pages-"))] || [];
      assert.ok(!pages.some((p) => p.startsWith("/dashboard") || p.includes("status=anteriores")), "stored: " + pages.join(", "));
    });

    await logoutViaUi(page);
    await step("logout removes stored pages", async () => {
      const c = await cacheState(page);
      const pages = c[Object.keys(c).find((k) => k.startsWith("lbl-pages-"))] || [];
      assert.ok(!pages.some((p) => p.startsWith("/dashboard")), "dashboard stored");
    });
    await step("offline after logout → private page shows nothing of the account", async () => {
      await ctx.setOffline(true);
      await page.goto(BASE + "/dashboard", { waitUntil: "load" });
      const text = await page.locator("body").innerText();
      assert.ok(/Sem conexão/.test(text));
      assert.ok(!text.includes(nameA.replace(/^Bem-vindo,\s*/, "").replace(/!$/, "")), "account A data visible offline");
      await ctx.setOffline(false);
    });

    await login(page, B);
    await step("account A → B: B never sees A's screens", async () => {
      await page.goto(BASE + "/dashboard", { waitUntil: "load" });
      const h1 = (await page.locator("h1").first().innerText()).trim();
      assert.notEqual(h1, nameA);
      await ctx.setOffline(true);
      await page.goto(BASE + "/dashboard", { waitUntil: "load" });
      assert.ok(!(await page.locator("body").innerText()).includes(nameA));
      await ctx.setOffline(false);
    });

    await step("prepared telão: arena media stored in full and replayed offline", async () => {
      if (!ARENA) throw new Error("ARENA_USER not set");
      await logoutViaUi(page);
      await login(page, ARENA);
      await page.goto(BASE + "/arena", { waitUntil: "load" });
      await page.getByRole("button", { name: /iniciar o telão/i }).click();
      await until(page, async () => {
        const k = (await caches.keys()).find((x) => x.startsWith("lbl-arena-"));
        if (!k) return false;
        const urls = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
        return ["/countdown.mp4", "/prontos.mp4", "/scoreboard-bg.png", "/winner-bg.png", "/finish-videos/BURST_FINISH.mp4"].every((u) => urls.includes(u));
      }, 60000);
      await ctx.setOffline(true);
      const r = await page.evaluate(async () => {
        try {
          const res = await fetch("/countdown.mp4", { headers: { Range: "bytes=0-99" } });
          return { status: res.status, len: (await res.arrayBuffer()).byteLength };
        } catch (e) { return { error: String(e), controlled: !!navigator.serviceWorker.controller }; }
      });
      assert.ok(!r.error, JSON.stringify(r));
      assert.equal(r.status, 206); assert.equal(r.len, 100);
      await ctx.setOffline(false);
    });

    await step("service worker update: v6 → current, old caches removed", async () => {
      // A device still holding the previous worker's cache (lbl-cache-v6)
      // receives a newly deployed worker script: activate must drop it.
      await page.evaluate(async () => { const c = await caches.open("lbl-cache-v6"); await c.put("/x", new Response("old")); });
      await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js?deploy=" + Date.now()); });
      await until(page, async () => !(await caches.keys()).includes("lbl-cache-v6"), 15000);
      const keys = await page.evaluate(async () => caches.keys());
      assert.ok(keys.every((k) => /^lbl-(static|arena|pages)-v\d+$/.test(k)), "unexpected caches: " + keys.join(", "));
    });
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(([s]) => s !== "ok").length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
