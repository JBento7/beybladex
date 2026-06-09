export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  try {
    // Test each table to find what's missing
    const results: Record<string, string> = {};

    try { await prisma.user.count(); results.user = "OK"; }
    catch (e) { results.user = String(e); }

    try { await prisma.tournament.count(); results.tournament = "OK"; }
    catch (e) { results.tournament = String(e); }

    try { await prisma.match.count(); results.match = "OK"; }
    catch (e) { results.match = String(e); }

    try { await prisma.matchPoint.count(); results.matchPoint = "OK"; }
    catch (e) { results.matchPoint = String(e); }

    try { await prisma.matchSet.count(); results.matchSet = "OK"; }
    catch (e) { results.matchSet = String(e); }

    try { await prisma.beyblade.count(); results.beyblade = "OK"; }
    catch (e) { results.beyblade = String(e); }

    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
