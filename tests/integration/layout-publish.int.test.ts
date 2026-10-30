// Layout publication (disposable DB, docs/EDITOR-LAYOUT.md): legacy read as
// version 0, transactional publish, conflicts, invalid input keeps the
// published version, legacy keys stay consistent, shared fonts protected.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { getLibrary, getPublished, listVersions, publishLayout } from "../../src/lib/layoutStore";

after(async () => { await prisma.$disconnect(); });
const put = (key: string, data: unknown) => prisma.arenaLayout.upsert({ where: { key }, create: { key, data: JSON.stringify(data) }, update: { data: JSON.stringify(data) } });
let admin = "";

test("legacy layout reads as version 0 with the same values", async () => {
  await prisma.layoutVersion.deleteMany({});
  admin = (await prisma.user.create({ data: { name: "Admin", email: `adm-layout-${Date.now()}@it.test`, password: "x", role: "ORGANIZER" } })).id;
  await put("winner", { name: { x: 30, y: 60, w: 20, fs: 2.4, ff: "Oswald" } });
  await put("winner::hidden", ["scoreLose"]);
  await put("winner::bg", { url: "data:image/png;base64,AAAA" });
  await put("fonts", [{ family: "Oswald", kind: "google" }]);
  const p = await getPublished("winner");
  assert.equal(p.version, 0);
  assert.deepEqual(p.composition.fields.name, { x: 30, y: 60, w: 20, fs: 2.4, ff: "Oswald" });
  assert.deepEqual(p.composition.hidden, ["scoreLose"]);
  assert.equal(p.composition.bg, "data:image/png;base64,AAAA");
});

test("publish: new version, legacy keys rewritten in the same transaction", async () => {
  const cur = await getPublished("winner");
  const comp = { ...cur.composition, fields: { ...cur.composition.fields, name: { ...cur.composition.fields.name, x: 35 } }, hidden: [] };
  const r = await publishLayout({ screen: "winner", baseVersion: 0, composition: comp, actorId: admin });
  assert.deepEqual(r, { ok: true, version: 1, warnings: [] });
  const p = await getPublished("winner");
  assert.equal(p.version, 1);
  assert.equal(p.composition.fields.name.x, 35);
  const legacy = JSON.parse((await prisma.arenaLayout.findUnique({ where: { key: "winner" } }))!.data);
  assert.equal(legacy.name.x, 35);
  assert.deepEqual(JSON.parse((await prisma.arenaLayout.findUnique({ where: { key: "winner::hidden" } }))!.data), []);
  assert.equal((await listVersions("winner"))[0].version, 1);
});

test("conflict: a draft based on an older version never overwrites silently", async () => {
  const cur = await getPublished("winner");
  const r = await publishLayout({ screen: "winner", baseVersion: 0, composition: cur.composition, actorId: admin });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 409);
  assert.equal((r as { conflict?: { version: number } }).conflict?.version, 1);
  // Two admins publishing from the same base at the same time: exactly one wins.
  const both = await Promise.all([
    publishLayout({ screen: "winner", baseVersion: 1, composition: cur.composition, actorId: admin }),
    publishLayout({ screen: "winner", baseVersion: 1, composition: cur.composition, actorId: admin }),
  ]);
  assert.deepEqual(both.map((x) => x.ok).sort(), [false, true]);
  assert.equal((await getPublished("winner")).version, 2);
});

test("invalid composition: nothing changes (no partial publication)", async () => {
  const before = await getPublished("winner");
  const legacyBefore = (await prisma.arenaLayout.findUnique({ where: { key: "winner" } }))!.data;
  const bad = { ...before.composition, fields: { ...before.composition.fields, name: { x: "x", y: 1 } } };
  const r = await publishLayout({ screen: "winner", baseVersion: before.version, composition: bad, actorId: admin });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 400);
  assert.equal((await getPublished("winner")).version, before.version);
  assert.equal((await prisma.arenaLayout.findUnique({ where: { key: "winner" } }))!.data, legacyBefore);
});

test("shared fonts: a font used by another published screen is kept and never silently replaced", async () => {
  // Winner (published) uses Oswald (google). The Placar draft tries to replace and remove it.
  const sb = await getPublished("scoreboard");
  const r1 = await publishLayout({
    screen: "scoreboard", baseVersion: sb.version, actorId: admin,
    composition: { ...sb.composition, fields: { ...sb.composition.fields, nameL: { ...sb.composition.fields.nameL, ff: "Oswald" } }, fonts: [{ family: "Oswald", kind: "upload", src: "data:font/ttf;base64,AAAA" }] },
  });
  assert.equal(r1.ok, false);
  assert.match((r1 as { error: string }).error, /Vencedor/);
  const r2 = await publishLayout({ screen: "scoreboard", baseVersion: sb.version, composition: sb.composition, fontsRemoved: ["Oswald"], actorId: admin });
  assert.equal(r2.ok, true);
  assert.match((r2 as { warnings: string[] }).warnings[0], /mantida/);
  assert.ok((await getLibrary()).some((f) => f.family === "Oswald"));
});
