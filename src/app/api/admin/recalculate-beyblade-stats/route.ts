export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalculateAllBeybladeStats } from "@/lib/tournament-engine";

// Rebuild every Beyblade's wins/losses from the real match history.
// Use this to fix stats that drifted after tournament resets, deletions, or W.O.s.
// ORGANIZER-only. Call: POST or GET /api/admin/recalculate-beyblade-stats
// (GET is supported so it can be triggered straight from the browser.)
async function run() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const summary = await recalculateAllBeybladeStats();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[recalculate-beyblade-stats] error:", e);
    return NextResponse.json({ error: `Erro ao recalcular: ${String(e)}` }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
