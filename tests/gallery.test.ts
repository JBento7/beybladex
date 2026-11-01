// Tournament gallery rules (lib/gallery): real file type, limits, input
// validation (cover, legacy links, duplicates), carousel order, wrap-around.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GALLERY_MAX_IMAGES, carouselOrder, coverCardUrl, imageIdFromUrl, imageUrl, sniffImageType, validateGallery, wrapIndex,
} from "../src/lib/gallery.ts";

const id = (c: string) => c.repeat(64);

test("type comes from the content, not the name", () => {
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), "image/webp");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg xmlns=...>")), null, "SVG/HTML renamed to .png is refused");
  assert.equal(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38])), null, "GIF not accepted");
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20])), null, "RIFF that isn't WebP");
});

test("urls of stored images round-trip; external links are not ids", () => {
  assert.equal(imageUrl(id("a"), "card"), `/api/images/${id("a")}?v=card`);
  assert.equal(imageIdFromUrl(imageUrl(id("b"))), id("b"));
  assert.equal(imageIdFromUrl(imageUrl(id("b"), "thumb")), id("b"));
  assert.equal(imageIdFromUrl("https://cdn.example/x.png"), null);
  assert.equal(imageIdFromUrl(null), null);
});

test("validation: limit, known uploads only, legacy link may stay but never be added, one cover", () => {
  const ctx = { keepUrls: ["https://old.example/capa.jpg"], knownIds: new Set([id("a"), id("b")]) };
  const ok = validateGallery([{ imageId: id("a"), alt: "  Cartaz  " }, { url: "https://old.example/capa.jpg", isCover: true }], ctx);
  assert.ok(ok.ok);
  assert.equal(ok.items[0].alt, "Cartaz");
  assert.equal(ok.items[1].isCover, true);
  const first = validateGallery([{ imageId: id("a") }, { imageId: id("b") }], ctx);
  assert.ok(first.ok && first.items[0].isCover && !first.items[1].isCover, "first image is the cover when none chosen");
  assert.equal(validateGallery([{ url: "https://evil.example/x.png" }], ctx).ok, false, "new external links refused");
  assert.equal(validateGallery([{ imageId: id("c") }], ctx).ok, false, "unknown upload refused");
  assert.equal(validateGallery([{ imageId: id("a") }, { imageId: id("a") }], ctx).ok, false, "duplicate refused");
  assert.equal(validateGallery([{ imageId: id("a"), isCover: true }, { imageId: id("b"), isCover: true }], ctx).ok, false, "two covers refused");
  const many = Array.from({ length: GALLERY_MAX_IMAGES + 1 }, (_, i) => ({ imageId: i.toString(16).padStart(64, "0") }));
  assert.equal(validateGallery(many, { keepUrls: [], knownIds: new Set(many.map((m) => m.imageId)) }).ok, false, "11 images refused");
  assert.equal(validateGallery([{ imageId: id("a"), alt: "x".repeat(500) }], ctx).ok && true, true);
  const v = validateGallery([], ctx);
  assert.ok(v.ok && v.items.length === 0, "empty gallery allowed (removes the cover)");
});

test("cover for cards uses the optimized version; carousel puts the cover first, then the order", () => {
  assert.equal(coverCardUrl([{ imageId: id("a"), url: null, isCover: false }, { imageId: id("b"), url: null, isCover: true }]), imageUrl(id("b"), "card"));
  assert.equal(coverCardUrl([{ imageId: null, url: "https://old/c.jpg", isCover: true }]), "https://old/c.jpg");
  assert.equal(coverCardUrl([]), null);
  const rows = [{ k: "x", position: 0, isCover: false }, { k: "y", position: 1, isCover: false }, { k: "c", position: 2, isCover: true }, { k: "z", position: 3, isCover: false }];
  assert.deepEqual(carouselOrder(rows).map((r) => r.k), ["c", "x", "y", "z"]);
  assert.equal(wrapIndex(5, 5), 0, "after the last, the first");
  assert.equal(wrapIndex(-1, 5), 4);
});
