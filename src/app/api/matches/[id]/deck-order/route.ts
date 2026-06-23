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
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { userId, setNumber, cycleIndex, bey1Id, bey2Id, bey3Id } = await req.json();
    if (!userId || setNumber == null || cycleIndex == null || !bey1Id || !bey2Id || !bey3Id) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    const match = await prisma.match.findUnique({
      where: { id: params.id },
      include: { tournament: { select: { organizerId: true } } },
    });
    if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

    const canEdit =
      match.tournament.organizerId === session.user.id ||
      session.user.role === "ORGANIZER" ||
      session.user.canJudge ||
      match.judgeId === session.user.id;

    if (!canEdit) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

    await prisma.matchDeckOrder.upsert({
      where: {
        matchId_userId_setNumber_cycleIndex: {
          matchId: params.id,
          userId,
          setNumber,
          cycleIndex,
        },
      },
      create: { matchId: params.id, userId, setNumber, cycleIndex, bey1Id, bey2Id, bey3Id },
      update: { bey1Id, bey2Id, bey3Id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
