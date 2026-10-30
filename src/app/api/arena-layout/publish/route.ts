export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { publishLayout } from "@/lib/layoutStore";
import { isScreen } from "@/lib/layoutDoc";
import { errorResponse, logEvent } from "@/lib/observability";

// "Aplicar no telão" (lib/layoutStore.publishLayout): validated, versioned and
// transactional; refused (409) when another admin published after the draft's
// base. Organizers only, as before.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !isScreen(body.screen)) return NextResponse.json({ error: "Tela inválida." }, { status: 400 });
  try {
    const r = await publishLayout({ screen: body.screen, baseVersion: body.baseVersion, composition: body.composition, fontsRemoved: body.fontsRemoved, actorId: session.user.id });
    if (!r.ok) return NextResponse.json(r, { status: r.status });
    logEvent("layout_published", { screen: body.screen, version: r.version, actorId: session.user.id });
    return NextResponse.json(r);
  } catch (e) {
    return errorResponse("/api/arena-layout/publish", e, "Não foi possível aplicar o layout. Nada foi alterado no telão.");
  }
}
