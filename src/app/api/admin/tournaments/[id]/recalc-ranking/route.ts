export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { recalculateStandings, finalizeTournamentRanking, getSwissRounds } from "@/lib/tournament-engine";

// ORGANIZER-only: recompute the FINAL ranking (placement + rankingPoints) of a
// tournament, even one already marked FINISHED. Use it to repair events that
// were finalized with the old, buggy playoff-boundary logic (which ranked a
// Suíço by "last round lost" instead of by wins). It first recomputes every
// participant's wins/points from the recorded matches, then re-runs the ranking.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, isOfficial: true, isTest: true, format: true, qualifiers: true },
    });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    // finalizeTournamentRanking always ends by marking the tournament FINISHED,
    // so running this on a live event would end it early and publish partial
    // ranking points. This tool is for repairing events that already ended.
    if (tournament.status !== "FINISHED") {
      return NextResponse.json(
        { error: `O torneio está ${tournament.status === "IN_PROGRESS" ? "em andamento" : "não encerrado"}. Encerre-o primeiro — esta ferramenta recalcula o ranking de torneios já finalizados.` },
        { status: 400 }
      );
    }

    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false } },
      select: { userId: true },
    });
    // Players excluded from the ranking because they were never approved.
    const notApproved = await prisma.tournamentParticipant.count({
      where: { tournamentId: params.id, approved: false },
    });

    // 1) Standings from the recorded matches (sequential: keeps the pool calm).
    for (const p of participants) {
      if (p.userId) await recalculateStandings(params.id, p.userId);
    }

    // 2) Final placement + ranking points.
    await finalizeTournamentRanking(params.id);

    const top = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false }, placement: { not: null } },
      orderBy: { placement: "asc" },
      take: 8,
      select: {
        placement: true,
        rankingPoints: true,
        totalPoints: true,
        wins: true,
        user: { select: { name: true, bladerName: true, isGuest: true, deleted: true, email: true } },
      },
    });

    // Knockout detection, mirroring the engine's boundary.
    const swissRounds = await getSwissRounds(params.id, participants.length);
    const knockoutMatches = await prisma.match.count({
      where: { tournamentId: params.id, round: { gt: swissRounds } },
    });

    // Why a champion may be missing from /rankings: the global ranking only sums
    // tournaments that are official AND not test, and skips guests/deleted users
    // and arena accounts.
    const warnings: string[] = [];
    if (!tournament.isOfficial) warnings.push("O torneio NÃO está marcado como oficial — nenhum jogador dele entra no ranking global.");
    if (tournament.isTest) warnings.push("O torneio está marcado como TESTE — é ignorado no ranking global.");
    if (tournament.format === "ROUND_ROBIN" && knockoutMatches === 0) {
      warnings.push("Não há partidas de mata-mata; os pontos foram dados pela classificação do suíço.");
    }
    if (notApproved > 0) warnings.push(`${notApproved} inscrito(s) não aprovado(s) ficam fora da classificação.`);
    const champion = top[0];
    if (champion?.user?.isGuest) warnings.push(`${champion.user.bladerName || champion.user.name} é convidado (guest) — convidados não aparecem no ranking global.`);
    if (champion?.user?.deleted) warnings.push("O 1º colocado está com a conta marcada como excluída.");

    return NextResponse.json({
      ok: true,
      participants: participants.length,
      tournament: {
        status: tournament.status,
        isOfficial: tournament.isOfficial,
        isTest: tournament.isTest,
        format: tournament.format,
        qualifiers: tournament.qualifiers,
        swissRounds,
        knockoutMatches,
      },
      warnings,
      top: top.map((t) => ({
        placement: t.placement,
        name: t.user?.bladerName || t.user?.name || "—",
        rankingPoints: t.rankingPoints,
        wins: t.wins,
        totalPoints: t.totalPoints,
        isGuest: t.user?.isGuest ?? false,
      })),
    });
  } catch (err) {
    console.error("[recalc-ranking]", err);
    return NextResponse.json({ error: `Erro ao recalcular ranking: ${String(err)}` }, { status: 500 });
  }
}
