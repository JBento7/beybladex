export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { loadMatchState } from "@/lib/matchState";
import { errorResponse } from "@/lib/observability";
import { recordReduel } from "@/lib/matchReduel";
import { parseReduelRequest } from "@/lib/reduelRules";

// "Reduel — repetir lançamento" (docs/REDUEL.md). Same permission as scoring
// (lib/matchPolicy): any account authorized to operate this scoreboard, in
// both judging modes. Body: { opId, setNumber, battle, attempt } — the battle
// the operator saw; a resend with the same opId is acknowledged, not repeated.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const access = await authorizeMatchOp(session, params.id, "reduel");
  if (!access.ok) return access.response;

  const body = parseReduelRequest(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    const out = await recordReduel(params.id, body, { actorId: access.actor.id, actorRole: access.as });
    const state = await loadMatchState(params.id, session);
    if (out.kind === "error") return NextResponse.json({ error: out.error, code: out.code, state }, { status: out.status });
    return NextResponse.json({ ok: true, replay: out.kind === "replay", reduel: { setNumber: out.setNumber, battle: out.battle, attempt: out.attempt, reduelsNow: out.reduelsNow, at: out.at }, state });
  } catch (e) {
    return errorResponse("/api/matches/[id]/reduel", e, "Não foi possível registrar o Reduel. Tente novamente.");
  }
}
