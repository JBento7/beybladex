// Heavy tournament work (standings, round generation, ranking): give it room on big events.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { SWISS_RULES_VERSION, isSwissFormat, validateCut } from "@/lib/swiss";
import {
  generateGroups,
  generateSingleElimination,
  generateSwissRound,
} from "@/lib/tournament-engine";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    let body: { arenas?: number; judgeIds?: string[] } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { participants: true } },
        participants: { select: { userId: true } },
      },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    if (tournament.organizerId !== session.user.id && session.user.role !== "ORGANIZER") {
      return NextResponse.json(
        { error: "Apenas organizadores podem iniciar o torneio" },
        { status: 403 }
      );
    }

    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "O torneio não está na fase de inscrições" },
        { status: 400 }
      );
    }

    // Count APPROVED participants — that is exactly the set the bracket/round
    // generators use. Counting every registration let a tournament start with
    // pending approvals and generate zero (or too few) matches, leaving it
    // IN_PROGRESS with nothing to play and no way to advance.
    const approvedCount = await prisma.tournamentParticipant.count({
      where: { tournamentId: params.id, approved: { not: false } },
    });
    const pending = tournament._count.participants - approvedCount;
    if (approvedCount < 2) {
      return NextResponse.json(
        {
          error:
            `São necessários pelo menos 2 participantes APROVADOS para iniciar (aprovados: ${approvedCount}` +
            (pending > 0 ? `, aguardando aprovação: ${pending}` : "") +
            ").",
        },
        { status: 400 }
      );
    }

    // Validate the confirmed arena count, if provided.
    // Suíço: the knockout cut must fit the field BEFORE starting (top 4/8/16,
    // equal to the field = everyone advances; larger = rejected).
    if (isSwissFormat(tournament.format)) {
      const cut = validateCut(tournament.qualifiers ?? null, approvedCount);
      if (cut.mode === "error") return NextResponse.json({ error: cut.message }, { status: 400 });
    }
    const data: { status: "IN_PROGRESS"; arenas?: number; rulesVersion?: string } = {
      status: "IN_PROGRESS",
      // Record the rule set this event is played under.
      ...(isSwissFormat(tournament.format) ? { rulesVersion: SWISS_RULES_VERSION } : {}),
    };
    if (body.arenas !== undefined) {
      const arenas = Number(body.arenas);
      if (!Number.isInteger(arenas) || arenas < 1 || arenas > 20) {
        return NextResponse.json({ error: "Número de arenas inválido" }, { status: 400 });
      }
      data.arenas = arenas;
    }

    // Validate the selected judges, if provided. Judges may be admins or
    // participants; we only require they're real, non-deleted users.
    let judgeIds: string[] = [];
    if (Array.isArray(body.judgeIds) && body.judgeIds.length > 0) {
      judgeIds = [...new Set(body.judgeIds.filter((id): id is string => typeof id === "string"))];
      const validJudges = await prisma.user.findMany({
        where: { id: { in: judgeIds }, deleted: false },
        select: { id: true },
      });
      if (validJudges.length !== judgeIds.length) {
        return NextResponse.json({ error: "Lista de juízes inválida" }, { status: 400 });
      }
    }

    // Atomically claim the tournament so two concurrent "start" requests can't
    // both generate a bracket. Only the request that flips the status wins.
    const claim = await prisma.tournament.updateMany({
      where: { id: params.id, status: "REGISTRATION" },
      data,
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "O torneio já foi iniciado" },
        { status: 400 }
      );
    }

    // Register the selected judges before generating matches — the schedulers
    // read TournamentJudge to assign a judge per match and keep judges from
    // having a parallel match while arbitrating.
    if (judgeIds.length > 0) {
      await prisma.tournamentJudge.createMany({
        data: judgeIds.map((userId) => ({ tournamentId: params.id, userId })),
        skipDuplicates: true,
      });
    }

    // Generate matches based on format. If generation fails, release the claim
    // so the organizer can try again instead of being stuck IN_PROGRESS.
    try {
      switch (tournament.format) {
        case "ROUND_ROBIN":
        case "SWISS": {
          // "Suíço" (both stored values): Swiss rounds, then the top-N knockout.
          const res = await generateSwissRound(params.id, 1);
          if (res.status !== "created" && res.status !== "exists") throw new Error(`Rodada 1 não gerada: ${res.notes.join(" ")}`);
          break;
        }
        case "GROUPS":
          await generateGroups(params.id);
          break;
        case "SINGLE_ELIMINATION":
          await generateSingleElimination(params.id);
          break;
      }
    } catch (genErr) {
      await prisma.tournament.update({
        where: { id: params.id },
        data: { status: "REGISTRATION" },
      });
      throw genErr;
    }

    const updated = await prisma.tournament.findUnique({ where: { id: params.id } });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
