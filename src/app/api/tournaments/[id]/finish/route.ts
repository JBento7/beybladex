// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { finalizeTournamentRanking, auditTournament } from "@/lib/tournament-engine";
import { hasBlocking, isSwissFormat } from "@/lib/swiss";

// POST — manually finish a tournament/BeyEncontro even if not all matches
// have been played. Any pending matches are left as-is; ranking is computed
// from the matches that did finish.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });

    const isAdminUser = session.user.role === "ORGANIZER";
    const isOrganizerOfThis = session.user.id === tournament.organizerId;
    const hasJudgePermission = !!session.user.canJudge;

    const canJudge = tournament.isOfficial
      ? isAdminUser || hasJudgePermission
      : isOrganizerOfThis || isAdminUser || hasJudgePermission;

    if (!canJudge) {
      return NextResponse.json({ error: "Sem permissão para encerrar este torneio" }, { status: 403 });
    }

    if (tournament.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "O torneio não está em andamento" }, { status: 400 });
    }

    // Suíço: never certify inconsistent records, and closing with unplayed
    // matches is an explicit, logged decision (the ranking then uses only
    // what was played).
    if (isSwissFormat(tournament.format)) {
      const body = (await req.json().catch(() => ({}))) as { force?: boolean; reason?: string };
      const issues = await auditTournament(params.id);
      if (hasBlocking(issues)) {
        return NextResponse.json({
          error: "Encerramento bloqueado: há registros inconsistentes (ex.: jogador com duas partidas na mesma rodada). Resolva-os antes de encerrar.",
          issues: issues.filter((i) => i.severity === "bloqueante"),
        }, { status: 409 });
      }
      const pending = await prisma.match.count({ where: { tournamentId: params.id, status: { not: "FINISHED" } } });
      if (pending > 0) {
        if (!body.force || !body.reason?.trim()) {
          return NextResponse.json({
            error: `Ainda há ${pending} partida(s) sem resultado. Encerrar agora define a colocação só com o que foi jogado. Confirme informando o motivo.`,
            requiresConfirmation: true,
            pending,
          }, { status: 409 });
        }
        await prisma.tournamentAdminAction.create({
          data: { tournamentId: params.id, kind: "FINISH_WITH_PENDING", reason: body.reason.slice(0, 500), actorId: session.user.id, after: { pending } },
        });
      }
    }

    // Atomically claim so two concurrent "finish" requests don't both run.
    const claim = await prisma.tournament.updateMany({
      where: { id: params.id, status: "IN_PROGRESS" },
      data: { status: "FINISHED" },
    });

    if (claim.count === 0) {
      return NextResponse.json({ error: "O torneio já foi encerrado" }, { status: 400 });
    }

    await finalizeTournamentRanking(params.id);

    const updated = await prisma.tournament.findUnique({ where: { id: params.id } });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
