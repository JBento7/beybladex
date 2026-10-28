export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditAdminAction } from "@/lib/adminAudit";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  // Affects every beyblade of BOTH leagues: general admin only.
  if (session.user.adminCommunity) {
    return NextResponse.json({ error: "Apenas o admin geral pode executar esta ferramenta (afeta as duas ligas)." }, { status: 403 });
  }

  const result = await prisma.beyblade.updateMany({
    data: { wins: 0, losses: 0 },
  });

  await auditAdminAction({ kind: "BEYBLADE_STATS_RESET_ALL", session, target: { beyblades: result.count } });
  return NextResponse.json({ ok: true, count: result.count });
}
