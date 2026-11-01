export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { assignFreeJudge } from "@/lib/tournament-engine";
import { startBattleGate, telaoOnlyGate } from "@/lib/matchGate";
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
  // Judge-only events start battles with /battle-start (no countdown on a telão).
  { const off = await telaoOnlyGate(params.id); if (off) return NextResponse.json({ error: off.error, code: off.code }, { status: off.status }); }

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

  // "Iniciar" is the official start of the battle (lib/matchGate): 3on3 + 1
  // reserva locks both trios here, and a format with an ordered deck needs
  // both players' order for this battle (set/cycle) — checked on the server.
  const gate = await startBattleGate(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error, code: gate.code, missing: gate.missing ?? null }, { status: gate.status });

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
