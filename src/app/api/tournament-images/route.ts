export const dynamic = "force-dynamic";
export const maxDuration = 30;
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GALLERY_MAX_BYTES } from "@/lib/gallery";
import { cleanupAbandoned, storeUpload } from "@/lib/galleryStore";
import { errorResponse } from "@/lib/observability";

// Upload of one gallery image (docs/GALERIA.md). Anyone who can create an
// event (any signed-in user — BeyEncontros) may upload; an upload changes no
// tournament: it only becomes visible when the creator/admin SAVES the
// tournament with it (permission checked there). Type checked by content.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Entre na sua conta para enviar imagens." }, { status: 401 });
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > GALLERY_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "Arquivo muito grande. O limite é 5 MB." }, { status: 413 });
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await storeUpload(bytes, session.user.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    cleanupAbandoned().catch(() => {}); // best effort
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse("/api/tournament-images", e, "Não foi possível enviar a imagem. Tente novamente.");
  }
}
