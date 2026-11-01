// Tournament gallery rules (docs/GALERIA.md) — limits, real file type, input
// validation and display order. Pure module (no imports): unit-tested, used by
// the server and by the forms.

export const GALLERY_MAX_IMAGES = 10; // cover included
export const GALLERY_MAX_BYTES = 5 * 1024 * 1024;
export const GALLERY_ALT_MAX = 200;
export const GALLERY_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type GalleryMime = (typeof GALLERY_TYPES)[number];
export type ImageVariant = "full" | "card" | "thumb";

/** Real type from the first bytes (magic numbers) — never from the name or
 *  the type the browser declared. */
export function sniffImageType(b: Uint8Array): GalleryMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Content-addressed ids: SHA-256 hex. */
export const isImageId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export function imageUrl(id: string, variant: ImageVariant = "full"): string {
  return variant === "full" ? `/api/images/${id}` : `/api/images/${id}?v=${variant}`;
}
/** Id of an uploaded image referenced by a URL produced by imageUrl. */
export function imageIdFromUrl(url: string | null | undefined): string | null {
  const m = /^\/api\/images\/([a-f0-9]{64})(?:\?|$)/.exec(url ?? "");
  return m ? m[1] : null;
}

export type GalleryInputItem = { imageId?: unknown; url?: unknown; alt?: unknown; isCover?: unknown };
export type GalleryItem = { imageId: string | null; url: string | null; alt: string; isCover: boolean };

/**
 * Validates the gallery sent by a form. `keepUrls` are the pre-gallery links
 * this tournament already had (they may stay, never be added); `knownIds`
 * the uploaded images that exist. Order = array order. Exactly one cover when
 * there is any image (the first one if none was marked).
 */
export function validateGallery(input: unknown, ctx: { keepUrls: string[]; knownIds: Set<string> }):
  { ok: true; items: GalleryItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Galeria inválida." };
  if (input.length > GALLERY_MAX_IMAGES) return { ok: false, error: `No máximo ${GALLERY_MAX_IMAGES} imagens por torneio (capa incluída).` };
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  for (const raw of input as GalleryInputItem[]) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Galeria inválida." };
    const alt = typeof raw.alt === "string" ? raw.alt.trim().slice(0, GALLERY_ALT_MAX) : "";
    let imageId: string | null = null, url: string | null = null;
    if (raw.imageId !== undefined && raw.imageId !== null) {
      if (!isImageId(raw.imageId) || !ctx.knownIds.has(raw.imageId)) return { ok: false, error: "Uma das imagens não foi enviada corretamente. Envie-a de novo." };
      imageId = raw.imageId;
    } else if (typeof raw.url === "string" && raw.url) {
      if (!ctx.keepUrls.includes(raw.url)) return { ok: false, error: "Imagem externa não permitida: envie o arquivo." };
      url = raw.url;
    } else return { ok: false, error: "Galeria inválida." };
    const key = imageId ?? url!;
    if (seen.has(key)) return { ok: false, error: "A mesma imagem aparece duas vezes na galeria." };
    seen.add(key);
    items.push({ imageId, url, alt, isCover: raw.isCover === true });
  }
  const covers = items.filter((i) => i.isCover).length;
  if (covers > 1) return { ok: false, error: "Escolha apenas uma capa." };
  if (items.length > 0 && covers === 0) items[0].isCover = true;
  return { ok: true, items };
}

/** URL the cards use for the cover (optimized card version when uploaded). */
export function coverCardUrl(items: { imageId: string | null; url: string | null; isCover: boolean }[]): string | null {
  const c = items.find((i) => i.isCover);
  if (!c) return null;
  return c.imageId ? imageUrl(c.imageId, "card") : c.url;
}

export type GalleryView = { src: string; thumb: string; alt: string; width?: number; height?: number };

/** Carousel order: the cover first, then the others in the organizer's order.
 *  A tournament without gallery rows shows its pre-gallery cover alone. */
export function carouselOrder<T extends { isCover: boolean; position: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const cover = sorted.find((r) => r.isCover);
  return cover ? [cover, ...sorted.filter((r) => r !== cover)] : sorted;
}

/** Next/previous slide with wrap-around. */
export const wrapIndex = (i: number, n: number) => (n <= 0 ? 0 : ((i % n) + n) % n);
