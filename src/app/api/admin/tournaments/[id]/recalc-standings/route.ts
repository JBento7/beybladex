export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateStandings } from "@/lib/tournament-engine";

// ORGANIZER-only: recompute wins/losses/points for EVERY participant from the
// current finished matches. Use it to verify/repair the standings after manual
// edits, resets, or duplicate cleanup. Pure recomputation — it never changes
// matches, only the derived standings.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  try {
    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId: params.id, approved: { not: false } },
      select: { userId: true },
    });

    // Sequential to avoid exhausting the connection pool on larger events.
    for (const p of participants) {
      if (p.userId) await recalculateStandings(params.id, p.userId);
    }

    return NextResponse.json({ ok: true, participants: participants.length });
  } catch (err) {
    console.error("[recalc-standings]", err);
    return NextResponse.json({ error: `Erro ao recalcular: ${String(err)}` }, { status: 500 });
  }
}
