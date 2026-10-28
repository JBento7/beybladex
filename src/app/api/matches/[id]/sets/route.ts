export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMatchTrio } from "@/lib/deckFormat";
import { trioView } from "@/lib/matchTrio";
import { isMatchStaff } from "@/lib/matchAccess";
import { usesBattleDeck } from "@/lib/deckFormat";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: {
        sets: {
          orderBy: { setNumber: "asc" },
          include: { points: { select: { id: true } } },
        },
        tournament: { select: { setsToWin: true, pointsToWinSet: true, deckType: true, communitySlug: true } },
      },
    });

    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const sets = match.sets.map(({ points: _pts, ...s }) => s);
    const player1Sets = sets.filter((s) => s.winnerId === match.player1Id).length;
    const player2Sets = sets.filter((s) => s.winnerId === match.player2Id).length;
    const currentSet = match.sets.find((s) => s.status === "IN_PROGRESS") ?? null;
    const matchFinished = match.status === "FINISHED";
    const currentSetBattleCount = currentSet ? currentSet.points.length : 0;

    // Fetch deck orders separately — table may not exist yet if migration hasn't run.
    let deckOrders: { userId: string }[] = [];
    try {
      deckOrders = await prisma.matchDeckOrder.findMany({
        where: { matchId: params.id },
        orderBy: { cycleIndex: "asc" },
      });
    } catch {
      // Table doesn't exist yet; deck order feature will be unavailable until /api/migrate is run.
    }
    // 3on3 + 1 reserva: an order reveals the trio. Until BOTH trios are
    // confirmed, each player's order is visible only to that player and to
    // staff (judge/organizer); after that (and after the lock) it's open.
    let trio: Awaited<ReturnType<typeof trioView>> = null;
    if (hasMatchTrio(match.tournament.deckType)) {
      const session = await getServerSession(authOptions);
      const viewer = session?.user ? { id: session.user.id, staff: await isMatchStaff(session, params.id) } : null;
      trio = await trioView(params.id, viewer);
      if (trio && !trio.bothConfirmed && !trio.locked && !viewer?.staff) {
        deckOrders = deckOrders.filter((o) => o.userId === viewer?.id);
      }
    }

    return NextResponse.json({
      sets,
      currentSet: currentSet ? { ...currentSet, points: undefined } : null,
      player1Sets,
      player2Sets,
      matchFinished,
      winnerId: match.winnerId,
      setsToWin: match.setsToWin ?? match.tournament.setsToWin,
      pointsToWinSet: match.pointsToWinSet ?? match.tournament.pointsToWinSet,
      isDeckThreeOnThree: usesBattleDeck(match.tournament.deckType),
      deckOrders,
      trio,
      currentSetBattleCount,
      // Which player is on the X side (other = B side); null until the judge sets it.
      xSidePlayerId: (match as { xSidePlayerId?: string | null }).xSidePlayerId ?? null,
      arena: (match as { arena?: number | null }).arena ?? 1,
      community: match.tournament.communitySlug,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
