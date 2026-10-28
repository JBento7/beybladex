export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { hasMatchTrio, orderMatchesTrio } from "@/lib/deckFormat";
import { currentTrioOf } from "@/lib/matchTrio";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      include: { tournament: { select: { organizerId: true, deckType: true } } },
    });
    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    // A judge/organizer can set any player's order; a player can set their OWN
    // order (choosing their deck sequence on their own phone). lib/matchPolicy.
    const access = await authorizeMatchOp(session, params.id, userId === session.user.id ? "deckOrderOwn" : "deckOrder");
    if (!access.ok) return access.response;

    // 3on3 + 1 reserva: the order must be exactly the player's 3 ACTIVE
    // Beyblades of this match (confirmed or locked trio) — never the reserve,
    // an outside id or a repeated one.
    if (hasMatchTrio(match.tournament.deckType)) {
      if (userId !== match.player1Id && userId !== match.player2Id) return NextResponse.json({ error: "Este jogador não está nesta partida." }, { status: 400 });
      const trio = await currentTrioOf(params.id, userId);
      if (!trio) return NextResponse.json({ error: "Confirme o trio desta partida antes de definir a ordem.", code: "TRIO_MISSING" }, { status: 409 });
      if (!orderMatchesTrio([bey1Id, bey2Id, bey3Id], trio)) {
        return NextResponse.json({ error: "A ordem deve usar exatamente as 3 Beyblades ativas desta partida (a reserva não entra).", code: "ORDER_NOT_TRIO" }, { status: 400 });
      }
    }

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
