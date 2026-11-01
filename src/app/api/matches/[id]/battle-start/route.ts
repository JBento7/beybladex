export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { assignFreeJudge } from "@/lib/tournament-engine";
import { startBattleGate } from "@/lib/matchGate";
import { effectiveDisplayMode } from "@/lib/displayMode";

// "Iniciar batalha" of a "Somente placar do juiz" event (docs/MODO-ARBITRAGEM.md):
// the same official start as "Iniciar" (permission, trios when declared,
// judge assignment) but nothing is stamped for a telão — no countdown, no
// PRONTOS, no video. ARENA events keep using /countdown.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({ where: { id: params.id }, select: { judgeId: true, tournament: { select: { displayMode: true } } } });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  const access = await authorizeMatchOp(session, params.id, "countdown");
  if (!access.ok) return access.response;
  if (effectiveDisplayMode(match.tournament.displayMode) !== "JUDGE_ONLY") {
    return NextResponse.json({ error: "Este torneio usa o telão Arena: inicie a batalha pelo botão Iniciar.", code: "USE_COUNTDOWN" }, { status: 409 });
  }

  const gate = await startBattleGate(params.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error, code: gate.code }, { status: gate.status });
  if (!match.judgeId) await assignFreeJudge(params.id);
  return NextResponse.json({ ok: true, at: Date.now() });
}
