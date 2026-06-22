export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recalculateAllBeybladeStats } from "@/lib/tournament-engine";

// Rebuild all BeybladeMatchRecord rows (and wins/losses counters) from scratch.
// GET and POST both work so it can be triggered straight from the browser.
// ORGANIZER only.
async function run() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const summary = await recalculateAllBeybladeStats();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[backfill-beyblade-records]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
