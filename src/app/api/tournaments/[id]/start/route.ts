export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  generateRoundRobin,
  generateGroups,
  generateSingleElimination,
  generateSwissRound,
} from "@/lib/tournament-engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
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

    if (tournament._count.participants < 2) {
      return NextResponse.json(
        { error: "São necessários pelo menos 2 participantes para iniciar" },
        { status: 400 }
      );
    }

    // Atomically claim the tournament so two concurrent "start" requests can't
    // both generate a bracket. Only the request that flips the status wins.
    const claim = await prisma.tournament.updateMany({
      where: { id: params.id, status: "REGISTRATION" },
      data: { status: "IN_PROGRESS" },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: "O torneio já foi iniciado" },
        { status: 400 }
      );
    }

    // Generate matches based on format. If generation fails, release the claim
    // so the organizer can try again instead of being stuck IN_PROGRESS.
    try {
      switch (tournament.format) {
        case "ROUND_ROBIN":
          await generateRoundRobin(params.id);
          break;
        case "GROUPS":
          await generateGroups(params.id);
          break;
        case "SINGLE_ELIMINATION":
          await generateSingleElimination(params.id);
          break;
        case "SWISS":
          await generateSwissRound(params.id, 1);
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
