export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The judge plays the launch/countdown video on THIS match's arena telão (e.g.
// to show players the countdown before the match). Same permission as scoring.
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
  const key = `launch:arena:${arena}`;
  try {
    await prisma.arenaLayout.upsert({ where: { key }, create: { key, data: JSON.stringify({ at: Date.now() }) }, update: { data: JSON.stringify({ at: Date.now() }) } });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, arena });
}
