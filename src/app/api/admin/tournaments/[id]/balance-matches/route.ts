export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { getSwissRounds, repairSwissRound } from "@/lib/tournament-engine";

// ORGANIZER-only controlled repair of Swiss rounds (replaces the old automatic
// "balancear", which could give a player a second match in a round and tore
// down the knockout). Body:
//   {}                                  → simulate every Swiss round (no writes)
//   { round, apply: true, reason }      → apply the plan of that round
// Only players MISSING from the round are paired among themselves; leftovers,
// duplicates and knockout impact are reported for a decision.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { round?: number; apply?: boolean; reason?: string };
  try {
    if (body.apply) {
      const round = Number(body.round);
      const res = await repairSwissRound(params.id, round, { apply: true, reason: body.reason, actorId: session.user.id });
      if (!res.ok) return NextResponse.json({ error: res.message, plan: "plan" in res ? res.plan : undefined }, { status: 409 });
      return NextResponse.json(res);
    }
    const count = await prisma.tournamentParticipant.count({ where: { tournamentId: params.id, approved: { not: false } } });
    const swissRounds = await getSwissRounds(params.id, count);
    const plans = [];
    for (let r = 1; r <= swissRounds; r++) {
      const exists = await prisma.match.count({ where: { tournamentId: params.id, round: r } });
      if (!exists) break;
      plans.push(await repairSwissRound(params.id, r));
    }
    return NextResponse.json({ simulation: true, plans });
  } catch (err) {
    console.error("[balance-matches]", err);
    return NextResponse.json({ error: `Erro no reparo: ${String(err)}` }, { status: 500 });
  }
}
