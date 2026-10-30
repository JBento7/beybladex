export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { authorizeMatchOp } from "@/lib/matchAccess";
import { prisma } from "@/lib/prisma";
import { parseCommandId, stampArenaSignal } from "@/lib/arenaCommands";

// "PRONTOS": the judge asks the players to get ready. The arena telão plays the
// PRONTOS clip and then HOLDS on its last frame until the countdown starts, so
// the players stay on the ready screen for as long as the judge needs.
// Same permission model as scoring.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  { const denied = await denyOutsideCommunity(session, { matchId: params.id }); if (denied) return denied; }
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    select: { arena: true, judgeId: true, tournament: { select: { organizerId: true, communitySlug: true, _count: { select: { judges: true } } } } },
  });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  // Shared server-side rule (lib/matchPolicy): no assigned judge no longer
  // means "anyone logged in"; open judging is an explicit event setting.
  const access = await authorizeMatchOp(session, params.id, "ready");
  if (!access.ok) return access.response;

  const arena = match.arena ?? 1;
  const commandId = parseCommandId((await req.json().catch(() => ({})))?.commandId);
  try {
    // Same commandId (a resend) → the stamp is not renewed (lib/arenaCommands).
    const s = await stampArenaSignal("ready", match.tournament.communitySlug, arena, { commandId, matchId: params.id });
    return NextResponse.json({ ok: true, arena, commandId, at: s.at, replay: s.replay });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
}
