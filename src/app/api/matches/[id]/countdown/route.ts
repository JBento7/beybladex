export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { assignFreeJudge } from "@/lib/tournament-engine";
import { errorResponse } from "@/lib/observability";

// The judge presses "Iniciar" → stamp the match so the arena display starts the
// 3-2-1-GO-SHOOT countdown video. Authorized for the judge/organizer, or anyone
// logged in when the tournament has no judges (open judging).
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
  const access = await authorizeMatchOp(session, params.id, "countdown");
  if (!access.ok) return access.response;

  let key = "";
  try {
    key = String((await req.json())?.key ?? "");
  } catch {
    /* body optional */
  }

  // If this match has no judge yet, try to grab one who's free right now.
  if (!match.judgeId) await assignFreeJudge(params.id);

  try {
    await prisma.match.update({
      where: { id: params.id },
      data: { countdownAt: new Date(), countdownKey: key },
    });
  } catch {
    return NextResponse.json({ error: "Colunas de contagem ausentes — rode /api/migrate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
