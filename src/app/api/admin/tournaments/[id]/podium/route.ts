export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RANKING_POINTS_BY_PLACE } from "@/lib/tournament-engine";

// ORGANIZER-only manual podium override.
//
// finalizeTournamentRanking derives the podium from the recorded matches. When
// those don't reflect what actually happened (a knockout that was played but
// never fully registered, or an event ranked under an older, buggy rule), the
// organizer can state the real podium here. Positions listed get the standard
// ranking points (100/70/50/30/10); everyone else keeps a placement below them
// and 0 ranking points.
//
// Body: { order: string[] }  — userIds from 1st place onward.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body?.order) ? body.order.filter(Boolean) : [];
  if (order.length === 0) {
    return NextResponse.json({ error: "Informe ao menos o 1º colocado." }, { status: 400 });
  }
  if (new Set(order).size !== order.length) {
    return NextResponse.json({ error: "O mesmo jogador aparece em duas posições." }, { status: 400 });
  }

  try {
    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false } },
      select: { id: true, userId: true, totalPoints: true, user: { select: { name: true, bladerName: true } } },
    });
    if (!participants.length) {
      return NextResponse.json({ error: "Torneio sem participantes aprovados." }, { status: 400 });
    }

    const byUser = new Map(participants.map((p) => [p.userId, p]));
    const unknown = order.filter((u) => !byUser.has(u));
    if (unknown.length) {
      return NextResponse.json(
        { error: `${unknown.length} jogador(es) do pódio não participam deste torneio.` },
        { status: 400 }
      );
    }

    // Everyone not on the podium keeps a placement below it, ordered by their
    // tournament score, and scores no ranking points.
    const rest = participants
      .filter((p) => !order.includes(p.userId))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const writes = [
      ...order.map((userId, idx) =>
        prisma.tournamentParticipant.update({
          where: { id: byUser.get(userId)!.id },
          data: { placement: idx + 1, rankingPoints: RANKING_POINTS_BY_PLACE[idx] ?? 0 },
        })
      ),
      ...rest.map((p, i) =>
        prisma.tournamentParticipant.update({
          where: { id: p.id },
          data: { placement: order.length + i + 1, rankingPoints: 0 },
        })
      ),
    ];
    await prisma.$transaction(writes);

    // The podium is the final word on this event — make sure it reads as closed.
    await prisma.tournament.update({ where: { id: params.id }, data: { status: "FINISHED" } });

    return NextResponse.json({
      ok: true,
      podium: order.map((userId, idx) => {
        const p = byUser.get(userId)!;
        return {
          placement: idx + 1,
          name: p.user?.bladerName || p.user?.name || "—",
          rankingPoints: RANKING_POINTS_BY_PLACE[idx] ?? 0,
        };
      }),
      others: rest.length,
    });
  } catch (err) {
    console.error("[podium]", err);
    return NextResponse.json({ error: `Erro ao definir pódio: ${String(err)}` }, { status: 500 });
  }
}
