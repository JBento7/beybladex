export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "PARTICIPANT") {
      return NextResponse.json(
        { error: "Apenas participantes podem se inscrever em torneios" },
        { status: 403 }
      );
    }

    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    }

    if (tournament.status !== "REGISTRATION") {
      return NextResponse.json(
        { error: "Torneio não está aceitando inscrições" },
        { status: 400 }
      );
    }

    if (
      tournament.maxParticipants &&
      tournament._count.participants >= tournament.maxParticipants
    ) {
      return NextResponse.json(
        { error: "Torneio está cheio" },
        { status: 400 }
      );
    }

    const existing = await prisma.tournamentParticipant.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: params.id,
          userId: session.user.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Você já está inscrito neste torneio" },
        { status: 409 }
      );
    }

    let body: { beyblade1?: string; beyblade2?: string; beyblade3?: string } = {};
    try {
      body = await req.json();
    } catch {
      // body optional
    }

    const { beyblade1, beyblade2, beyblade3 } = body;

    // Validate required beyblades based on deckType
    if (tournament.deckType === "THREE_ON_THREE") {
      if (!beyblade1 || !beyblade2 || !beyblade3) {
        return NextResponse.json(
          { error: "Três Beyblades são necessárias para o formato 3 contra 3" },
          { status: 400 }
        );
      }
    } else {
      if (!beyblade1) {
        return NextResponse.json(
          { error: "O nome da Beyblade é obrigatório" },
          { status: 400 }
        );
      }
    }

    const participant = await prisma.tournamentParticipant.create({
      data: {
        tournamentId: params.id,
        userId: session.user.id,
        beyblade1: beyblade1 || null,
        beyblade2: beyblade2 || null,
        beyblade3: beyblade3 || null,
      },
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
