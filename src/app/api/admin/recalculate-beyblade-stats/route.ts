export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalculateAllBeybladeStats } from "@/lib/tournament-engine";
import { auditAdminAction } from "@/lib/adminAudit";
import { errorResponse } from "@/lib/observability";

// Rebuild every Beyblade's wins/losses from the real match history.
// Use this to fix stats that drifted after tournament resets, deletions, or W.O.s.
// General admin only. Call: POST /api/admin/recalculate-beyblade-stats
// (GET is supported so it can be triggered straight from the browser.)
async function run() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Affects every beyblade of BOTH leagues: general admin only.
  if (session.user.adminCommunity) {
    return NextResponse.json({ error: "Apenas o admin geral pode executar esta ferramenta (afeta as duas ligas)." }, { status: 403 });
  }

  try {
    const summary = await recalculateAllBeybladeStats();
    await auditAdminAction({ kind: "BEYBLADE_STATS_RECALC_ALL", session });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[recalculate-beyblade-stats] error:", e);
    return errorResponse("/api/admin/recalculate-beyblade-stats", e, "Erro ao recalcular. Tente novamente.");
  }
}

// POST only: a GET must never change data.
export const POST = run;
