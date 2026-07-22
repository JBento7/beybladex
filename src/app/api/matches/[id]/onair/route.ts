export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Heartbeat: while a judge keeps the scoreboard ("Placar") open, this is POSTed
// periodically to stamp Match.onAirAt = now. The arena display only shows a
// match whose onAirAt is fresh — so a match appears on the tablet ONLY while a
// judge is actively scoring it. POST {clear:true} (on close) blanks it early.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let match;
  try {
    match = await prisma.match.findUnique({
      where: { id: params.id },
      select: {
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

  let clear = false;
  try {
    clear = Boolean((await req.json())?.clear);
  } catch {
    /* body optional */
  }

  try {
    await prisma.match.update({
      where: { id: params.id },
      data: { onAirAt: clear ? null : new Date() },
    });
  } catch {
    return NextResponse.json({ error: "Coluna onAirAt ausente — rode /api/migrate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
