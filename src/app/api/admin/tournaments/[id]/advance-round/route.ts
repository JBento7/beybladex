// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import {
  advanceSwissTournament,
  advanceSingleElimination,
  generateSwissRound,
  finalizeTournamentRanking,
  auditTournament,
  getSwissRounds,
} from "@/lib/tournament-engine";
import { hasBlocking, isSwissFormat } from "@/lib/swiss";
import { errorResponse, withObservability } from "@/lib/observability";

// ORGANIZER-only: force round advancement for a tournament whose latest round
// is fully finished but whose next round/knockout was never generated (e.g. the
// last match was closed via a path that didn't trigger advancement). Idempotent:
// does nothing if the next round already exists or the round isn't complete.
// Body (optional): { allowRematches: true, reason: "..." } — explicit, logged
// exception when no Swiss round without rematches exists.
async function postHandler(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
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
    if (isSwissFormat(tournament.format)) {
      // One engine for both stored Swiss formats.
      const issues = await auditTournament(tournament.id);
      if (hasBlocking(issues)) {
        return NextResponse.json({
          error: "Avanço bloqueado: há registros inconsistentes. Resolva-os antes de continuar (nada foi alterado).",
          issues: issues.filter((i) => i.severity === "bloqueante"),
        }, { status: 409 });
      }
      const swissRounds = await getSwissRounds(tournament.id);
      if (round < swissRounds) {
        const body = await req.json().catch(() => ({} as { allowRematches?: boolean; reason?: string }));
        const res = await generateSwissRound(tournament.id, round + 1, {
          allowRematches: !!body.allowRematches,
          reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined,
          actorId: session.user.id,
        });
        if (res.status !== "created" && res.status !== "exists") {
          return NextResponse.json({
            error: res.status === "limit"
              ? "O limite de busca foi atingido antes de encontrar uma rodada válida (isso não prova que ela não exista). Nada foi gravado."
              : res.status === "impossible"
                ? "Não existe rodada sem reencontro. Para continuar, autorize a exceção informando o motivo. Nada foi gravado."
                : "Não foi possível gerar a rodada. Nada foi gravado.",
            status: res.status,
            notes: res.notes,
          }, { status: 409 });
        }
        return NextResponse.json({ ok: true, round, result: res });
      }
      await advanceSwissTournament(tournament.id, round);
    } else if (tournament.format === "SINGLE_ELIMINATION") {
      await advanceSingleElimination(tournament.id, round);
    } else {
      await finalizeTournamentRanking(tournament.id);
    }
  } catch (e) {
    console.error("[advance-round]", e);
    return errorResponse("/api/admin/tournaments/[id]/advance-round", e, "Erro ao avançar. Tente novamente.");
  }

  const created = await prisma.match.count({ where: { tournamentId: tournament.id, round: round + 1 } });
  return NextResponse.json({ ok: true, round, nextRoundMatches: created });
}

export const POST = withObservability("/api/admin/tournaments/[id]/advance-round", postHandler);
