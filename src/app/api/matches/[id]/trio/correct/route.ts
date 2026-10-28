export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { correctLockedTrio } from "@/lib/matchTrio";
import { withObservability } from "@/lib/observability";

// Administrative correction of a LOCKED trio (the confrontation already
// started). Organizer/admin only, mandatory reason, audited. Points already
// scored keep the Beyblade that scored them (nothing is reassigned). A
// finished match keeps its formation (historical).
async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; beybladeIds?: unknown; reason?: unknown };
  if (typeof body.userId !== "string") return NextResponse.json({ error: "Informe o jogador." }, { status: 400 });
  const access = await authorizeMatchOp(session, params.id, "deckOrder");
  if (!access.ok) return access.response;
  if (access.as !== "admin" && access.as !== "organizer") {
    return NextResponse.json({ error: "Somente a organização pode corrigir um trio depois do início do confronto." }, { status: 403 });
  }
  const r = await correctLockedTrio({
    matchId: params.id, userId: body.userId, beybladeIds: body.beybladeIds,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "", actor: { id: session.user.id, role: access.as },
  });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ ...r, impact: "Os pontos já marcados continuam com a Beyblade que os marcou. As ordens que usavam a Beyblade retirada foram descartadas." });
}

export const POST = withObservability("/api/matches/[id]/trio/correct", postHandler);
