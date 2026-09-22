export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "PRONTOS": the judge asks the players to get ready. The arena telão plays the
// PRONTOS clip and then HOLDS on its last frame until the countdown starts, so
// the players stay on the ready screen for as long as the judge needs.
// Same permission model as scoring.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { arena: true, judgeId: true, tournament: { select: { organizerId: true, _count: { select: { judges: true } } } } },
  });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  const openJudging = match.tournament._count.judges === 0;
  const allowed =
    openJudging ||
    match.tournament.organizerId === session.user.id ||
    session.user.role === "ORGANIZER" ||
    session.user.canJudge ||
    match.judgeId === session.user.id;
  if (!allowed) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const arena = match.arena ?? 1;
  const key = `ready:arena:${arena}`;
  try {
    await prisma.arenaLayout.upsert({
      where: { key },
      create: { key, data: JSON.stringify({ at: Date.now() }) },
      update: { data: JSON.stringify({ at: Date.now() }) },
    });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, arena });
}
