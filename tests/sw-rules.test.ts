// The service worker (public/sw.js) and the middleware must agree on which
// pages are private (never stored offline), and the worker's cache lists must
// keep arena media out of the general caches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPrivatePage } from "../src/lib/privatePages.ts";

const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
// Evaluate only the pure declarations of the worker (no `self` needed).
const pick = (name: string) => {
  const m = new RegExp(`const ${name} = [\\s\\S]*?;\\n`).exec(src);
  assert.ok(m, `missing ${name}`);
  return m![0];
};
const sw = new Function(`${pick("PRIVATE_PREFIXES")}${pick("isPrivatePath")}${pick("STATIC_FILES")}${pick("STATIC_PREFIXES")}${pick("ARENA_FILES")}
  return { isPrivatePath, STATIC_FILES, STATIC_PREFIXES, ARENA_FILES };`)() as {
  isPrivatePath: (p: string) => boolean; STATIC_FILES: string[]; STATIC_PREFIXES: string[]; ARENA_FILES: string[];
};

test("service worker and middleware agree on private pages", () => {
  const paths = [
    "/", "/tournaments", "/tournaments/abc", "/tournaments/abc/edit", "/tournaments/abc/certificates", "/tournaments/create",
    "/dashboard", "/dashboard/x", "/profile", "/profile/stats", "/admin", "/admin/layout", "/juiz", "/arena", "/rankings",
    "/community", "/regras", "/login", "/register", "/verify-email", "/reset-password", "/test-tournaments", "/beyparts", "/dashboardx",
  ];
  for (const p of paths) assert.equal(sw.isPrivatePath(p), isPrivatePage(p), p);
});

test("arena media is never in the general static list", () => {
  for (const f of sw.ARENA_FILES) {
    assert.ok(!sw.STATIC_FILES.includes(f), f);
    assert.ok(!sw.STATIC_PREFIXES.some((x) => f.startsWith(x)), f);
  }
  assert.ok(!/PRECACHE/.test(src), "no global precache");
});
