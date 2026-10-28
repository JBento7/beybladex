export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalculateAllBeybladeStats } from "@/lib/tournament-engine";
import { auditAdminAction } from "@/lib/adminAudit";

// Rebuild all BeybladeMatchRecord rows (and wins/losses counters) from scratch.
// POST only (a GET must never change data). General admin only: it rewrites
// the records of both leagues.
async function run() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER" || session.user.adminCommunity) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const summary = await recalculateAllBeybladeStats();
    await auditAdminAction({ kind: "BEYBLADE_RECORDS_BACKFILL", session });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[backfill-beyblade-records]", e);
    return NextResponse.json({ error: "Erro ao reconstruir os registros. Veja os logs." }, { status: 500 });
  }
}

export const POST = run;
