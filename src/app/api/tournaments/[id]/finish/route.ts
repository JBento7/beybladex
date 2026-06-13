export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeTournamentRanking } from "@/lib/tournament-engine";

// POST — manually finish a tournament/BeyEncontro even if not all matches
// have been played. Any pending matches are left as-is; ranking is computed
// from the matches that did finish.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
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
