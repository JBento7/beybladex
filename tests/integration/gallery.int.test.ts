// Tournament gallery (disposable DB, docs/GALERIA.md): uploads validated by
// content and re-encoded with card/thumb versions; gallery saved atomically
// with the cover mirrored to bannerUrl; a refused save keeps the previous
// gallery; shared files are never deleted; legacy covers are kept.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prisma } from "../../src/lib/prisma";
import { deleteIfUnused, loadGallery, galleryView, saveGalleryTx, storeUpload } from "../../src/lib/galleryStore";
import { imageUrl } from "../../src/lib/gallery";

after(async () => { await prisma.$disconnect(); });
const tag = `gl${Date.now()}`;
let n = 0;
const mkUser = () => prisma.user.create({ data: { name: `U${n}`, bladerName: `${tag}-${n}`, email: `${tag}-${n++}@it.test`, password: "x" } });
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 40, b: 90 } } }).png().toBuffer();
const jpg = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 10, b: 10 } } }).jpeg().toBuffer();
async function mkTournament(bannerUrl: string | null = null) {
  const org = await mkUser();
  return prisma.tournament.create({ data: { name: `${tag} T${n}`, format: "SWISS", status: "REGISTRATION", organizerId: org.id, bannerUrl } });
}
const save = (tid: string, gallery: unknown, banner: string | null) => prisma.$transaction((tx) => saveGalleryTx(tx, tid, gallery, banner));

test("upload: real images accepted and re-encoded with versions; fake/oversized refused; same file stored once", async () => {
  const u = await mkUser();
  const tall = await storeUpload(new Uint8Array(await jpg(1200, 3000, 200)), u.id);
  assert.ok(tall.ok);
  assert.equal(tall.width, 960, "fits in 2400 px keeping proportion (1200×3000 → 960×2400)");
  assert.equal(tall.height, 2400);
  const row = await prisma.storedImage.findUniqueOrThrow({ where: { id: tall.id } });
  assert.equal(row.mime, "image/jpeg");
  assert.equal((await sharp(Buffer.from(row.thumb)).metadata()).width, 320);
  assert.equal((await sharp(Buffer.from(row.card)).metadata()).format, "webp");
  const again = await storeUpload(new Uint8Array(await jpg(1200, 3000, 200)), u.id);
  assert.ok(again.ok && again.id === tall.id, "content-addressed: one copy");

  const fake = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  const r1 = await storeUpload(fake, u.id);
  assert.ok(!r1.ok && r1.status === 415, "HTML named .png refused");
  const broken = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  assert.ok(!(await storeUpload(broken, u.id)).ok, "PNG header with garbage refused");
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
  assert.ok(!(await storeUpload(gif, u.id)).ok, "GIF refused");
  const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set([0xff, 0xd8, 0xff]);
  const r2 = await storeUpload(big, u.id);
  assert.ok(!r2.ok && r2.status === 413, "over 5 MB refused");
});

test("save: order, cover mirrored to bannerUrl (cards), alt; reorder/remove/change cover", async () => {
  const u = await mkUser();
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) { const r = await storeUpload(new Uint8Array(await png(800, 600, 10 + i)), u.id); assert.ok(r.ok); ids.push(r.id); }
  const t = await mkTournament();
  const r = await save(t.id, [{ imageId: ids[0], alt: "Regras" }, { imageId: ids[1], alt: "Horários", isCover: true }, { imageId: ids[2] }], null);
  assert.ok(r.ok);
  let tt = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(tt.bannerUrl, imageUrl(ids[1], "card"), "cards use the chosen cover (optimized version)");
  let view = galleryView(await loadGallery(t.id, tt.bannerUrl));
  assert.deepEqual(view.map((v) => v.alt), ["Horários", "Regras", ""], "carousel: cover first, then the order");
  // Change cover + reorder + remove one.
  const r2 = await save(t.id, [{ imageId: ids[2], isCover: true }, { imageId: ids[0], alt: "Regras" }], tt.bannerUrl);
  assert.ok(r2.ok && r2.removed.length === 1 && r2.removed[0] === ids[1]);
  tt = await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(tt.bannerUrl, imageUrl(ids[2], "card"), "new cover reaches the cards");
  view = galleryView(await loadGallery(t.id, tt.bannerUrl));
  assert.equal(view.length, 2);
  await deleteIfUnused(r2.removed);
  assert.equal(await prisma.storedImage.count({ where: { id: ids[1] } }), 0, "removed and unused → deleted");
});

test("refused save keeps the previous gallery and cover; shared files are never deleted", async () => {
  const u = await mkUser();
  const a = await storeUpload(new Uint8Array(await png(500, 500, 99)), u.id);
  const b = await storeUpload(new Uint8Array(await png(500, 500, 98)), u.id);
  assert.ok(a.ok && b.ok);
  const t1 = await mkTournament(), t2 = await mkTournament();
  assert.ok((await save(t1.id, [{ imageId: a.id }], null)).ok);
  assert.ok((await save(t2.id, [{ imageId: a.id }, { imageId: b.id }], null)).ok, "same file in two tournaments");
  // A transaction that fails after the gallery write rolls everything back.
  await assert.rejects(prisma.$transaction(async (tx) => {
    const g = await saveGalleryTx(tx, t1.id, [{ imageId: b.id }], imageUrl(a.id, "card"));
    assert.ok(g.ok);
    throw new Error("falha ao salvar o torneio");
  }));
  const kept = await prisma.tournamentImage.findMany({ where: { tournamentId: t1.id } });
  assert.deepEqual(kept.map((k) => k.imageId), [a.id], "previous gallery intact");
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: t1.id } })).bannerUrl, imageUrl(a.id, "card"));
  // Invalid input is refused before writing anything.
  const bad = await save(t1.id, [{ imageId: "f".repeat(64) }], imageUrl(a.id, "card"));
  assert.equal(bad.ok, false);
  assert.equal(await prisma.tournamentImage.count({ where: { tournamentId: t1.id } }), 1);
  // t1 drops `a`, but t2 still uses it → kept.
  const r = await save(t1.id, [], imageUrl(a.id, "card"));
  assert.ok(r.ok && r.removed[0] === a.id);
  assert.equal(await deleteIfUnused(r.removed), 0);
  assert.equal(await prisma.storedImage.count({ where: { id: a.id } }), 1, "shared file kept");
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: t1.id } })).bannerUrl, null, "no cover → default card image");
});

test("legacy cover (external link) is shown and may be kept, never replaced by a new link", async () => {
  const legacy = "https://exemplo.com/banner-antigo.jpg";
  const t = await mkTournament(legacy);
  const view = galleryView(await loadGallery(t.id, legacy));
  assert.equal(view.length, 1);
  assert.equal(view[0].src, legacy);
  assert.ok(view[0].isCover);
  const u = await mkUser();
  const up = await storeUpload(new Uint8Array(await png(640, 360, 5)), u.id);
  assert.ok(up.ok);
  const r = await save(t.id, [{ url: legacy, isCover: true }, { imageId: up.id, alt: "Premiação" }], legacy);
  assert.ok(r.ok);
  assert.equal((await prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).bannerUrl, legacy, "old cover kept on the cards");
  assert.equal((await save(t.id, [{ url: "https://outro.com/x.jpg" }], legacy)).ok, false);
});
