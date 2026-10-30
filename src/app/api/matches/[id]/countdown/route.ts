export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { assignFreeJudge } from "@/lib/tournament-engine";
import { lockTrios } from "@/lib/matchTrio";
import { errorResponse } from "@/lib/observability";
import { parseCommandId } from "@/lib/arenaCommands";

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
        countdownAt: true,
        countdownKey: true,
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
  let commandId: string | null = null;
  try {
    const body = await req.json();
    key = String(body?.key ?? "");
    commandId = parseCommandId(body?.commandId);
  } catch {
    /* body optional */
  }
  // A resend of the same press (same commandId) is acknowledged without a new
  // stamp, so the telão never restarts a countdown that already played.
  if (commandId && match.countdownKey === commandId && match.countdownAt) {
    return NextResponse.json({ ok: true, commandId, at: match.countdownAt.getTime(), replay: true });
  }

  // 3on3 + 1 reserva: "Iniciar" is the official start of the confrontation —
  // both trios are validated and locked here (lib/matchTrio). Without both
  // confirmed trios the match can't start.
  const lock = await lockTrios(params.id);
  if (lock && !lock.ok) return NextResponse.json({ error: lock.error, code: lock.code }, { status: lock.status });

  // If this match has no judge yet, try to grab one who's free right now.
  if (!match.judgeId) await assignFreeJudge(params.id);

  try {
    await prisma.match.update({
      where: { id: params.id },
      // countdownKey = the command id (telão dedupes local + server copies by it).
      data: { countdownAt: new Date(), countdownKey: commandId ?? key },
    });
  } catch {
    return NextResponse.json({ error: "Colunas de contagem ausentes — rode /api/migrate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, commandId, at: Date.now(), replay: false });
}
