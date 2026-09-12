export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/tournament-engine";

// ORGANIZER-only: remove duplicate matches created before round generation was
// made idempotent. A duplicate = same round + same unordered player pair. We
// keep the most-progressed copy (FINISHED > IN_PROGRESS > PENDING, then the one
// with the most recorded sets/points, then the oldest) and delete the rest along
// with their child rows. Standings are recalculated afterwards.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      select: {
        id: true,
        round: true,
        player1Id: true,
        player2Id: true,
        status: true,
        createdAt: true,
        _count: { select: { sets: true, points: true } },
      },
    });

    // Group by round + unordered player pair.
    const groups = new Map<string, typeof matches>();
    for (const m of matches) {
      const pair = [m.player1Id, m.player2Id].sort().join("|");
      const key = `${m.round}::${pair}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }

    const statusRank: Record<string, number> = { FINISHED: 3, IN_PROGRESS: 2, PENDING: 1 };
    const progress = (m: (typeof matches)[number]) =>
      (statusRank[m.status] ?? 0) * 1000 + (m._count.sets + m._count.points);

    const toDelete: string[] = [];
    const affectedUsers = new Set<string>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Best copy first: more progress, then older.
      const sorted = [...group].sort((a, b) => {
        const d = progress(b) - progress(a);
        if (d !== 0) return d;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      for (const dup of sorted.slice(1)) {
        toDelete.push(dup.id);
        affectedUsers.add(dup.player1Id);
        affectedUsers.add(dup.player2Id);
      }
    }

    if (toDelete.length === 0) {
      return NextResponse.json({ ok: true, removed: 0 });
    }

    await prisma.$transaction(
      async (tx) => {
        // Delete child rows first (only BeybladeMatchRecord cascades on match).
        await tx.matchPoint.deleteMany({ where: { matchId: { in: toDelete } } });
        await tx.matchSet.deleteMany({ where: { matchId: { in: toDelete } } });
        try {
          await tx.matchDeckOrder.deleteMany({ where: { matchId: { in: toDelete } } });
        } catch {
          // table may not exist pre-migration — ignore
        }
        await tx.match.deleteMany({ where: { id: { in: toDelete } } });
      },
      { maxWait: 15000, timeout: 30000 }
    );

    // Recalculate standings for everyone whose duplicate matches were removed.
    for (const uid of affectedUsers) {
      await recalculateStandings(params.id, uid);
    }

    return NextResponse.json({ ok: true, removed: toDelete.length });
  } catch (err) {
    console.error("[dedupe-matches]", err);
    return NextResponse.json({ error: `Erro ao remover duplicadas: ${String(err)}` }, { status: 500 });
  }
}
