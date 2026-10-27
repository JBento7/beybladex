// The post-login redirect must stay on this site (no open redirect).
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeCallbackUrl } from "../src/lib/safeRedirect.ts";

test("keeps same-site relative paths", () => {
  assert.equal(safeCallbackUrl("/tournaments/create"), "/tournaments/create");
  assert.equal(safeCallbackUrl("/tournaments/abc?aba=resumo"), "/tournaments/abc?aba=resumo");
});

test("rejects other sites and tricks", () => {
  for (const bad of ["https://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "tournaments", "", null, undefined]) {
    // Absolute URLs are only accepted in the browser for the same origin; on
    // the server (no window) the path is kept only after the origin check —
    // here we assert the protocol-relative and scheme tricks are refused.
    const out = safeCallbackUrl(bad as string);
    if (typeof bad === "string" && bad.startsWith("https://")) assert.equal(out, "/x"); // no window → path only, never the host
    else assert.equal(out, null, String(bad));
  }
});

test("never loops back to login/register", () => {
  assert.equal(safeCallbackUrl("/login?x=1"), null);
  assert.equal(safeCallbackUrl("/register"), null);
});
