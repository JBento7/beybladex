// Monitoring must never hand database internals or secrets to the caller, and
// test tools stay off in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError, errorResponse, withObservability } from "../src/lib/observability.ts";
import { testToolsAllowed } from "../src/lib/testTools.ts";

const dbError = Object.assign(new Error('Invalid `prisma.user.findMany()` invocation: column "secretCol" of relation "User" does not exist at postgres://admin:hunter2@db.internal:5432/prod'), { code: "P2022" });

test("errorResponse: generic message + request id, no DB details", async () => {
  const logs: string[] = []; const orig = console.log; console.log = (s: string) => logs.push(s);
  try {
    const res = errorResponse("/api/x", dbError);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.ok(body.requestId);
    const text = JSON.stringify(body);
    for (const leak of ["prisma", "secretCol", "hunter2", "postgres://", "db.internal"]) assert.ok(!text.includes(leak), leak);
  } finally { console.log = orig; }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"event":"api_error"/);
});

test("withObservability: thrown errors become safe responses, conflicts are 409", async () => {
  const orig = console.log; console.log = () => {};
  try {
    const h = withObservability("/api/y", async () => { throw dbError; });
    const r = await h(new Request("http://x/api/y", { method: "POST" }));
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(await r.json()).includes("hunter2"));
    const c = withObservability("/api/y", async () => { throw Object.assign(new Error("dup"), { code: "P2002" }); });
    assert.equal((await c(new Request("http://x/api/y"))).status, 409);
    assert.equal(classifyError(Object.assign(new Error("Can't reach database server"), { code: "P1001" })), "infrastructure");
  } finally { console.log = orig; }
});

test("polled endpoints log only slow/error requests", async () => {
  const logs: string[] = []; const orig = console.log; console.log = (s: string) => logs.push(s);
  try {
    const fast = withObservability("/api/v", async () => new Response("{}"), { logSuccess: "slow" });
    await fast(new Request("http://x/api/v"));
    assert.equal(logs.length, 0);
    const all = withObservability("/api/p", async () => new Response("{}"));
    await all(new Request("http://x/api/p", { method: "POST" }));
    assert.equal(logs.length, 1);
  } finally { console.log = orig; }
});

test("test tools: off on Vercel production unless explicitly enabled", () => {
  assert.equal(testToolsAllowed({ VERCEL_ENV: "production" }), false);
  assert.equal(testToolsAllowed({ VERCEL_ENV: "production", ENABLE_TEST_TOOLS: "1" }), true);
  assert.equal(testToolsAllowed({ VERCEL_ENV: "preview" }), true);
  assert.equal(testToolsAllowed({}), true);
});
