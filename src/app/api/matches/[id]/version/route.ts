export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Connection check of the judge panel without a telão ("Somente placar do
// juiz"): returns only the score version, so the panel refreshes when it
// changed elsewhere. Unlike /onair it marks nothing as being on a telão.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const m = await prisma.match.findUnique({ where: { id: params.id }, select: { scoreVersion: true } });
  if (!m) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, scoreVersion: m.scoreVersion }, { headers: { "Cache-Control": "no-store" } });
}
