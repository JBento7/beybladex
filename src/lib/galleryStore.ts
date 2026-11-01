// Server side of the tournament gallery (docs/GALERIA.md): stores uploads
// (validated by content, re-encoded, with card/thumbnail versions), saves a
// gallery atomically with its tournament and removes files only when no
// reference uses them any more.
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  GALLERY_MAX_BYTES, carouselOrder, coverCardUrl, imageIdFromUrl, imageUrl, sniffImageType, validateGallery,
  type GalleryItem,
} from "./gallery";

type Tx = Prisma.TransactionClient;
export type UploadResult =
  | { ok: true; id: string; width: number; height: number; thumb: string; card: string; full: string }
  | { ok: false; status: number; error: string };

const FULL_MAX = 2400;
const MAX_PIXELS = 50_000_000; // decompression-bomb guard
const SHARP_FORMAT: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

/** Unsaved uploads per user in 24 h (an abandoned form can't fill the DB). */
const UNSAVED_PER_USER = 40;

export async function storeUpload(bytes: Uint8Array, userId: string): Promise<UploadResult> {
  if (bytes.length === 0) return { ok: false, status: 400, error: "Arquivo vazio." };
  if (bytes.length > GALLERY_MAX_BYTES) return { ok: false, status: 413, error: `Arquivo muito grande (${(bytes.length / 1024 / 1024).toFixed(1)} MB). O limite é 5 MB.` };
  const mime = sniffImageType(bytes);
  if (!mime) return { ok: false, status: 415, error: "Formato não aceito. Envie JPEG, PNG ou WebP." };

  const id = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.storedImage.findUnique({ where: { id }, select: { width: true, height: true } });
  if (existing) return { ok: true, id, width: existing.width, height: existing.height, thumb: imageUrl(id, "thumb"), card: imageUrl(id, "card"), full: imageUrl(id) };

  const recent = await prisma.storedImage.count({ where: { uploadedById: userId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) }, usages: { none: {} } } });
  if (recent >= UNSAVED_PER_USER) return { ok: false, status: 429, error: "Muitas imagens enviadas sem salvar. Salve o torneio ou tente mais tarde." };

  let full: Buffer, card: Buffer, thumb: Buffer, width: number, height: number;
  try {
    // Decoding proves the content is a real image of the sniffed type.
    const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (SHARP_FORMAT[mime] !== meta.format) return { ok: false, status: 415, error: "O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP." };
    const base = () => sharp(bytes, { limitInputPixels: MAX_PIXELS }).rotate(); // EXIF orientation; metadata dropped
    const fullPipe = base().resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true });
    const out = mime === "image/png" ? fullPipe.png({ compressionLevel: 9 }) : mime === "image/webp" ? fullPipe.webp({ quality: 88 }) : fullPipe.jpeg({ quality: 88, mozjpeg: true });
    const done = await out.toBuffer({ resolveWithObject: true });
    full = done.data; width = done.info.width; height = done.info.height;
    card = await base().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    thumb = await base().resize({ width: 320, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  } catch {
    return { ok: false, status: 415, error: "Não foi possível ler a imagem. O arquivo pode estar corrompido." };
  }
  await prisma.storedImage.upsert({
    where: { id },
    create: { id, mime, width, height, size: full.length, data: full, card, thumb, uploadedById: userId },
    update: {},
  });
  return { ok: true, id, width, height, thumb: imageUrl(id, "thumb"), card: imageUrl(id, "card"), full: imageUrl(id) };
}

export type GalleryRow = { id: string; imageId: string | null; url: string | null; alt: string; position: number; isCover: boolean; width: number | null; height: number | null };

/** Gallery of a tournament, in the organizer's order. Without rows, the
 *  pre-gallery cover (bannerUrl) is the only image — old events keep it. */
export async function loadGallery(tournamentId: string, bannerUrl: string | null, db: Tx | typeof prisma = prisma): Promise<GalleryRow[]> {
  const rows = await db.tournamentImage.findMany({
    where: { tournamentId }, orderBy: { position: "asc" },
    select: { id: true, imageId: true, url: true, alt: true, position: true, isCover: true, image: { select: { width: true, height: true } } },
  }).catch(() => []);
  if (rows.length === 0) {
    if (!bannerUrl) return [];
    const imageId = imageIdFromUrl(bannerUrl);
    return [{ id: "legacy", imageId, url: imageId ? null : bannerUrl, alt: "", position: 0, isCover: true, width: null, height: null }];
  }
  return rows.map((r) => ({ id: r.id, imageId: r.imageId, url: r.url, alt: r.alt, position: r.position, isCover: r.isCover, width: r.image?.width ?? null, height: r.image?.height ?? null }));
}

/** What the detail page and the editors receive. */
export function galleryView(rows: GalleryRow[]) {
  return carouselOrder(rows).map((r) => ({
    imageId: r.imageId, url: r.url, alt: r.alt, isCover: r.isCover,
    src: r.imageId ? imageUrl(r.imageId) : r.url!,
    thumb: r.imageId ? imageUrl(r.imageId, "thumb") : r.url!,
    width: r.width, height: r.height,
  }));
}

/**
 * Replaces the gallery of a tournament INSIDE the caller's transaction (with
 * the tournament change itself): if anything fails, the previous gallery and
 * cover stay as they were. Returns the images that left this tournament, to
 * be removed after the commit if nothing else uses them.
 */
export async function saveGalleryTx(tx: Tx, tournamentId: string, input: unknown, currentBannerUrl: string | null):
  Promise<{ ok: true; removed: string[]; items: GalleryItem[] } | { ok: false; error: string }> {
  const before = await tx.tournamentImage.findMany({ where: { tournamentId }, select: { imageId: true, url: true } });
  const keepUrls = [...before.map((b) => b.url).filter((u): u is string => !!u), ...(currentBannerUrl && !imageIdFromUrl(currentBannerUrl) ? [currentBannerUrl] : [])];
  const ids = Array.isArray(input) ? (input as { imageId?: unknown }[]).map((i) => i?.imageId).filter((x): x is string => typeof x === "string") : [];
  const known = new Set((await tx.storedImage.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id));
  const v = validateGallery(input, { keepUrls, knownIds: known });
  if (!v.ok) return v;

  await tx.tournamentImage.deleteMany({ where: { tournamentId } });
  if (v.items.length) {
    await tx.tournamentImage.createMany({
      data: v.items.map((it, position) => ({ tournamentId, imageId: it.imageId, url: it.url, alt: it.alt, position, isCover: it.isCover })),
    });
  }
  await tx.tournament.update({ where: { id: tournamentId }, data: { bannerUrl: coverCardUrl(v.items) } });

  const prevIds = new Set([...before.map((b) => b.imageId).filter((x): x is string => !!x), ...(imageIdFromUrl(currentBannerUrl) ? [imageIdFromUrl(currentBannerUrl)!] : [])]);
  const nowIds = new Set(v.items.map((i) => i.imageId).filter((x): x is string => !!x));
  return { ok: true, removed: [...prevIds].filter((id) => !nowIds.has(id)), items: v.items };
}

/** Deletes stored images that no gallery row and no cover URL reference. A
 *  file shared by another tournament (same content) is kept. */
export async function deleteIfUnused(ids: string[]): Promise<number> {
  let deleted = 0;
  for (const id of ids) {
    const [rows, covers] = await Promise.all([
      prisma.tournamentImage.count({ where: { imageId: id } }),
      prisma.tournament.count({ where: { bannerUrl: { startsWith: `/api/images/${id}` } } }),
    ]);
    if (rows === 0 && covers === 0) deleted += (await prisma.storedImage.deleteMany({ where: { id, usages: { none: {} } } })).count;
  }
  return deleted;
}

/** Uploads never saved in a tournament (abandoned forms), after a day. */
export async function cleanupAbandoned(): Promise<number> {
  const old = await prisma.storedImage.findMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) }, usages: { none: {} } }, select: { id: true }, take: 50 });
  return deleteIfUnused(old.map((o) => o.id));
}
