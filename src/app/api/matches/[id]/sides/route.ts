export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The judge assigns the stadium sides before the first round: which player is on
// the X side (the other is on the B side). POST { xSidePlayerId }.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let match;
  try {
    match = await prisma.match.findUnique({
      where: { id: params.id },
      select: {
        player1Id: true,
        player2Id: true,
        judgeId: true,
        tournament: { select: { organizerId: true, _count: { select: { judges: true } } } },
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Banco desatualizado — rode /api/migrate", detail: String(e).slice(0, 200) },
      { status: 500 }
    );
  }
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  const openJudging = match.tournament._count.judges === 0;
  const allowed =
    openJudging ||
    match.tournament.organizerId === session.user.id ||
    session.user.role === "ORGANIZER" ||
    session.user.canJudge ||
    match.judgeId === session.user.id;
  if (!allowed) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  let xSidePlayerId: string | null = null;
  try {
    xSidePlayerId = String((await req.json())?.xSidePlayerId ?? "") || null;
  } catch {
    /* body optional */
  }
  if (xSidePlayerId && xSidePlayerId !== match.player1Id && xSidePlayerId !== match.player2Id) {
    return NextResponse.json({ error: "Jogador inválido" }, { status: 400 });
  }

  try {
    await prisma.match.update({ where: { id: params.id }, data: { xSidePlayerId } });
  } catch {
    return NextResponse.json({ error: "Coluna xSidePlayerId ausente — rode /api/migrate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, xSidePlayerId });
}
