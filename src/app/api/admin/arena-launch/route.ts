export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only: tell one arena's telão to play the launch/rules video. The signal
// is stored per arena in ArenaLayout ("launch:arena:<n>") and the arena tick
// picks it up. POST { arena: number }.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const arena = Number((await req.json().catch(() => ({})))?.arena);
  if (!arena || Number.isNaN(arena)) return NextResponse.json({ error: "Arena inválida" }, { status: 400 });

  const key = `launch:arena:${arena}`;
  const data = JSON.stringify({ at: Date.now() });
  try {
    await prisma.arenaLayout.upsert({ where: { key }, create: { key, data }, update: { data } });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
