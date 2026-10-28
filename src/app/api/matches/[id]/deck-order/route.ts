export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { userId, setNumber, cycleIndex, bey1Id, bey2Id, bey3Id } = await req.json();
    if (!userId || setNumber == null || cycleIndex == null || !bey1Id || !bey2Id || !bey3Id) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: { select: { organizerId: true } } },
    });
    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    // A judge/organizer can set any player's order; a player can set their OWN
    // order (choosing their deck sequence on their own phone). lib/matchPolicy.
    const access = await authorizeMatchOp(session, params.id, userId === session.user.id ? "deckOrderOwn" : "deckOrder");
    if (!access.ok) return access.response;

    if (access.as !== "player") {
      // A judge/organizer setting someone else's order is recorded.
      await prisma.matchAuditLog.create({ data: { tournamentId: access.tournamentId, matchId: params.id, actorId: access.actor.id, actorRole: access.as, op: "deck_order", after: { userId, setNumber, cycleIndex, bey1Id, bey2Id, bey3Id } } });
    }
    await prisma.matchDeckOrder.upsert({
      where: {
        matchId_userId_setNumber_cycleIndex: {
          matchId: params.id,
          userId,
          setNumber,
          cycleIndex,
        },
      },
      create: { matchId: params.id, userId, setNumber, cycleIndex, bey1Id, bey2Id, bey3Id },
      update: { bey1Id, bey2Id, bey3Id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
