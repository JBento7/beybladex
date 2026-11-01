export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { denyOutsideCommunity } from "@/lib/communityScope";
import { prisma } from "@/lib/prisma";
import { resetTestTournament } from "@/lib/testTournamentReset";
import { auditAdminAction } from "@/lib/adminAudit";

// POST — wipe all matches/results from a test tournament and reopen
// registration, so admins can reuse it to test the site's flows again.
// Restricted to test tournaments (isTest: true) and ORGANIZER users.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    { const denied = await denyOutsideCommunity(session, { tournamentId: params.id }); if (denied) return denied; }
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
    if (!tournament) return NextResponse.json({ error: "Torneio não encontrado" }, { status: 404 });
    if (!tournament.isTest) {
      return NextResponse.json({ error: "Apenas torneios de teste podem ser reiniciados" }, { status: 400 });
    }

    const { matches } = await resetTestTournament(params.id);

    await auditAdminAction({ kind: "TEST_TOURNAMENT_RESET", session, tournamentId: params.id, before: { status: tournament.status, matches } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
