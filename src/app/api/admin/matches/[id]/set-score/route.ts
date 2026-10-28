// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { isSwissFormat } from "@/lib/swiss";
import {
  recalculateStandings,
  advanceSwissTournament,
  advanceSingleElimination,
  generateSwissRound,
  finalizeTournamentRanking,
} from "@/lib/tournament-engine";

// ORGANIZER-only manual score editor. Unlike /reset, this does NOT reset the
// match — it rewrites the recorded score directly. The admin supplies, per set,
// the points for each player; we rebuild the MatchSet rows and generic
// MatchPoint records so aggregate points and standings stay consistent, then
// recompute the match winner from sets won. This is a correction tool: it does
// not touch arena signals and does not touch per-beyblade win/loss records.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { sets?: { p1Points?: number; p2Points?: number }[]; confirmAfterAdvance?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  try {
  const rawSets = Array.isArray(body.sets) ? body.sets : [];
  const sets = rawSets.map((s) => ({
    p1: Math.max(0, Math.floor(Number(s.p1Points) || 0)),
    p2: Math.max(0, Math.floor(Number(s.p2Points) || 0)),
  }));

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      tournamentId: true,
      player1Id: true,
      player2Id: true,
      round: true,
      setsToWin: true,
      winnerId: true,
      status: true,
      tournament: { select: { setsToWin: true, format: true } },
    },
  });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  if (match.player1Id === match.player2Id) {
    return NextResponse.json({ error: "Partida inválida (bye)" }, { status: 400 });
  }

  const setsToWin = match.setsToWin ?? match.tournament.setsToWin ?? 1;

  // Per-set winner: whoever has more points that set (ties = no winner).
  const setWinnerOf = (p1: number, p2: number) =>
    p1 > p2 ? match.player1Id : p2 > p1 ? match.player2Id : null;

  let p1SetsWon = 0;
  let p2SetsWon = 0;
  for (const s of sets) {
    const w = setWinnerOf(s.p1, s.p2);
    if (w === match.player1Id) p1SetsWon++;
    else if (w === match.player2Id) p2SetsWon++;
  }

  // Match winner only when someone reached the required sets.
  const matchWinnerId =
    p1SetsWon >= setsToWin && p1SetsWon > p2SetsWon
      ? match.player1Id
      : p2SetsWon >= setsToWin && p2SetsWon > p1SetsWon
        ? match.player2Id
        : null;

  // Correcting a result AFTER the next round (or the knockout) was generated
  // changes standings that pairings/seeding already used. Allowed only as an
  // explicit, logged decision; the already-generated rounds are not rebuilt.
  const laterRounds = await prisma.match.count({ where: { tournamentId: match.tournamentId, round: { gt: match.round } } });
  if (laterRounds > 0 && matchWinnerId !== match.winnerId) {
    if (!body.confirmAfterAdvance || !body.reason?.trim()) {
      return NextResponse.json({
        error: "Esta correção muda o vencedor de uma partida de rodada já encerrada: a classificação usada nos pareamentos seguintes (ou no corte do mata-mata) muda, mas as rodadas já geradas não são refeitas. Confirme informando o motivo.",
        requiresConfirmation: true,
      }, { status: 409 });
    }
    await prisma.tournamentAdminAction.create({
      data: {
        tournamentId: match.tournamentId, kind: "RESULT_CHANGED_AFTER_ADVANCE", reason: body.reason.slice(0, 500), actorId: session.user.id,
        before: { matchId: match.id, winnerId: match.winnerId, status: match.status },
        after: { matchId: match.id, winnerId: matchWinnerId, sets },
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Match" WHERE id = ${params.id} FOR UPDATE`;
    await tx.matchPoint.deleteMany({ where: { matchId: params.id } });
    await tx.matchSet.deleteMany({ where: { matchId: params.id } });

    for (let i = 0; i < sets.length; i++) {
      const s = sets[i];
      const winnerId = setWinnerOf(s.p1, s.p2);
      const created = await tx.matchSet.create({
        data: {
          matchId: params.id,
          setNumber: i + 1,
          player1Points: s.p1,
          player2Points: s.p2,
          winnerId,
          status: "FINISHED",
        },
      });
      // Rebuild generic points (1pt SPIN_FINISH each) so totals/standings match.
      const rows: { matchId: string; userId: string; finishType: "SPIN_FINISH"; points: number; setId: string }[] = [];
      for (let n = 0; n < s.p1; n++) rows.push({ matchId: params.id, userId: match.player1Id, finishType: "SPIN_FINISH", points: 1, setId: created.id });
      for (let n = 0; n < s.p2; n++) rows.push({ matchId: params.id, userId: match.player2Id, finishType: "SPIN_FINISH", points: 1, setId: created.id });
      if (rows.length) await tx.matchPoint.createMany({ data: rows });
    }

    await tx.match.update({
      where: { id: params.id },
      data: {
        winnerId: matchWinnerId,
        status: matchWinnerId ? "FINISHED" : sets.length > 0 ? "IN_PROGRESS" : "PENDING",
      },
    });
  }, { maxWait: 15000, timeout: 30000 });

  await Promise.all([
    recalculateStandings(match.tournamentId, match.player1Id),
    recalculateStandings(match.tournamentId, match.player2Id),
  ]);

  // If this edit finished the match, run the same round-advancement logic the
  // normal scoring flow uses, so editing the last result of a round still
  // generates the next Swiss round / knockout. Guard against re-generating a
  // round that already exists (editing an earlier round after it advanced would
  // otherwise duplicate the next round).
  if (matchWinnerId) {
    const fmt = match.tournament.format;
    try {
      const nextExists = await prisma.match.count({ where: { tournamentId: match.tournamentId, round: { gt: match.round } } });
      if (nextExists === 0) {
        if (isSwissFormat(fmt)) {
          await advanceSwissTournament(match.tournamentId, match.round);
        } else if (fmt === "SINGLE_ELIMINATION") {
          await advanceSingleElimination(match.tournamentId, match.round);
        } else {
          const allMatches = await prisma.match.findMany({ where: { tournamentId: match.tournamentId } });
          if (allMatches.every((m) => m.status === "FINISHED")) await finalizeTournamentRanking(match.tournamentId);
        }
      }
    } catch (e) {
      // Advancement is best-effort; the score edit itself already succeeded.
      console.error("[set-score] advancement failed", e);
    }
  }

  return NextResponse.json({ ok: true, p1SetsWon, p2SetsWon, winnerId: matchWinnerId });
  } catch (err) {
    console.error("[set-score]", err);
    return NextResponse.json({ error: `Erro ao salvar: ${String(err)}` }, { status: 500 });
  }
}
