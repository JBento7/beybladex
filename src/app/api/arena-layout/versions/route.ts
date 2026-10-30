export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublished, getVersion, listVersions } from "@/lib/layoutStore";
import { isScreen } from "@/lib/layoutDoc";
import { errorResponse } from "@/lib/observability";

// Version history of a screen (organizers): ?screen=… lists; &id=… returns one
// composition; &current=1 returns the newest published one (conflict review).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  const screen = req.nextUrl.searchParams.get("screen");
  if (!isScreen(screen)) return NextResponse.json({ error: "Tela inválida." }, { status: 400 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (req.nextUrl.searchParams.get("current")) return NextResponse.json(await getPublished(screen));
    if (id) {
      const v = await getVersion(screen, id);
      return v ? NextResponse.json(v) : NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ versions: await listVersions(screen) });
  } catch (e) {
    return errorResponse("/api/arena-layout/versions", e, "Não foi possível carregar o histórico.");
  }
}
