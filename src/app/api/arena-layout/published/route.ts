export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublished } from "@/lib/layoutStore";
import { isScreen, type Screen } from "@/lib/layoutDoc";
import { errorResponse } from "@/lib/observability";

// Published layouts (newest version of each screen) — what the telões show.
// Drafts never live on the server, so nothing here can be a draft.
// Any signed-in user may read (the telão and quick match need it).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const screens = (req.nextUrl.searchParams.get("screens") ?? "scoreboard").split(",").filter(isScreen).slice(0, 3) as Screen[];
  try {
    const out: Record<string, { version: number; composition: unknown }> = {};
    for (const s of screens) {
      const p = await getPublished(s);
      out[s] = { version: p.version, composition: p.composition };
    }
    return NextResponse.json({ screens: out }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse("/api/arena-layout/published", e, "Não foi possível carregar o layout.");
  }
}
