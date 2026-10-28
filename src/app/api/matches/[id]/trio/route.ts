export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp, isMatchStaff } from "@/lib/matchAccess";
import { setTrio, trioView } from "@/lib/matchTrio";
import { withObservability } from "@/lib/observability";

// 3on3 + 1 reserva — the active trio of each player in this match.
// GET: what the viewer may see (own deck + trio; the opponent's trio only
//      once both confirmed; staff sees both).
// POST { userId, beybladeIds: [3 ids], reason? }: confirm/revise before the
//      lock. A player for themself; a judge/organizer for a player (audited).
async function getHandler(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  const viewer = session?.user ? { id: session.user.id, staff: await isMatchStaff(session, params.id) } : null;
  const view = await trioView(params.id, viewer);
  if (!view) return NextResponse.json({ error: "Partida não encontrada ou fora do formato 3 on 3 + 1 reserva." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}

async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; beybladeIds?: unknown; reason?: unknown };
  const userId = typeof body.userId === "string" ? body.userId : session.user.id;
  // Same rule as the deck order (lib/matchPolicy): own trio → the player;
  // someone else's → judge/organizer/admin of this match.
  const access = await authorizeMatchOp(session, params.id, userId === session.user.id ? "deckOrderOwn" : "deckOrder");
  if (!access.ok) return access.response;
  const r = await setTrio({
    matchId: params.id, userId, beybladeIds: body.beybladeIds,
    actor: { id: session.user.id, role: access.as }, reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r);
}

export const GET = withObservability("/api/matches/[id]/trio", getHandler, { logSuccess: "slow" });
export const POST = withObservability("/api/matches/[id]/trio", postHandler);
