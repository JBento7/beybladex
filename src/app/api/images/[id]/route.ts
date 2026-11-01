import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isImageId } from "@/lib/gallery";

// Serves a stored gallery image (docs/GALERIA.md). Ids are content hashes, so
// a URL never changes meaning: cached for a year. ?v=card|thumb → WebP
// versions for cards and miniatures; default = the full image.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!isImageId(id)) return new NextResponse("Não encontrada", { status: 404 });
  const v = req.nextUrl.searchParams.get("v");
  const variant = v === "card" || v === "thumb" ? v : "full";
  const row = await prisma.storedImage.findUnique({
    where: { id },
    select: { mime: true, data: variant === "full", card: variant === "card", thumb: variant === "thumb" },
  }) as { mime: string; data?: Uint8Array; card?: Uint8Array; thumb?: Uint8Array } | null;
  if (!row) return new NextResponse("Não encontrada", { status: 404 });
  const body = (variant === "full" ? row.data : variant === "card" ? row.card : row.thumb)!;
  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": variant === "full" ? row.mime : "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
