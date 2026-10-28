export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listTournaments } from "@/lib/tournamentList";
import { parseLiga, parseStatus } from "@/lib/tournamentFilters";
import { withObservability } from "@/lib/observability";

// One page of the tournament list (filters + "carregar mais"). The result
// depends on the viewer (drafts, "inscrito"), so it is never shared-cached.
async function getHandler(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const session = await getServerSession(authOptions);
  try {
    const data = await listTournaments({
      session,
      status: parseStatus(sp.get("status")),
      liga: parseLiga(sp.get("liga")),
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? 0),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[tournaments/list]", String(e).slice(0, 200));
    return NextResponse.json({ error: "Não foi possível carregar os torneios agora." }, { status: 503 });
  }
}

export const GET = withObservability("/api/tournaments/list", getHandler, { logSuccess: "slow" });
