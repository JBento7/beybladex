export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  advanceSwissTournament,
  advanceSingleElimination,
  generateSwissRound,
  finalizeTournamentRanking,
} from "@/lib/tournament-engine";

// ORGANIZER-only: force round advancement for a tournament whose latest round
// is fully finished but whose next round/knockout was never generated (e.g. the
// last match was closed via a path that didn't trigger advancement). Idempotent:
// does nothing if the next round already exists or the round isn't complete.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: { id: true, format: true },
  });
  if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

  // Highest round that has matches.
  const last = await prisma.match.findFirst({
    where: { tournamentId: tournament.id },
    orderBy: { round: "desc" },
    select: { round: true },
  });
  if (!last) return NextResponse.json({ error: "Torneio sem partidas" }, { status: 400 });
  const round = last.round;

  const roundMatches = await prisma.match.findMany({ where: { tournamentId: tournament.id, round } });
  if (!roundMatches.every((m) => m.status === "FINISHED")) {
    return NextResponse.json({ error: "A rodada atual ainda não terminou." }, { status: 400 });
  }

  const nextExists = await prisma.match.count({ where: { tournamentId: tournament.id, round: round + 1 } });
  if (nextExists > 0) {
    return NextResponse.json({ ok: true, alreadyGenerated: true });
  }

  try {
    if (tournament.format === "ROUND_ROBIN") {
      await advanceSwissTournament(tournament.id, round);
    } else if (tournament.format === "SINGLE_ELIMINATION") {
      await advanceSingleElimination(tournament.id, round);
    } else if (tournament.format === "SWISS") {
      const participants = await prisma.tournamentParticipant.count({ where: { tournamentId: tournament.id } });
      const maxRounds = Math.ceil(Math.log2(Math.max(2, participants)));
      if (round < maxRounds) await generateSwissRound(tournament.id, round + 1);
      else await finalizeTournamentRanking(tournament.id);
    } else {
      await finalizeTournamentRanking(tournament.id);
    }
  } catch (e) {
    console.error("[advance-round]", e);
    return NextResponse.json({ error: `Erro ao avançar: ${String(e)}` }, { status: 500 });
  }

  const created = await prisma.match.count({ where: { tournamentId: tournament.id, round: round + 1 } });
  return NextResponse.json({ ok: true, round, nextRoundMatches: created });
}
