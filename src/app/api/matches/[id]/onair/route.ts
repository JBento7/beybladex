export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/observability";

// Heartbeat: while a judge keeps the scoreboard ("Placar") open, this is POSTed
// periodically to stamp Match.onAirAt = now. The arena display only shows a
// match whose onAirAt is fresh — so a match appears on the tablet ONLY while a
// judge is actively scoring it. POST {clear:true} (on close) blanks it early.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
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
      { error: "Banco desatualizado — rode /api/migrate" },
      { status: 500 }
    );
  }
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
  // means "anyone logged in"; open judging is an explicit event setting.
  const access = await authorizeMatchOp(session, params.id, "onair");
  if (!access.ok) return access.response;

  let clear = false;
  try {
    clear = Boolean((await req.json())?.clear);
  } catch {
    /* body optional */
  }

  let scoreVersion: number | null = null;
  try {
    const m = await prisma.match.update({
      where: { id: params.id },
      data: { onAirAt: clear ? null : new Date() },
      select: { scoreVersion: true },
    });
    scoreVersion = m.scoreVersion;
  } catch {
    return NextResponse.json({ error: "Coluna onAirAt ausente — rode /api/migrate" }, { status: 500 });
  }

  // The judge panel compares this with the version on screen: a change made
  // elsewhere (another device, an admin) triggers one state refresh — no extra poll.
  return NextResponse.json({ ok: true, scoreVersion });
}
