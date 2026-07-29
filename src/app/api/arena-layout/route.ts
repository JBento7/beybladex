export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/arena-layout?key=scoreboard → saved field overrides (or {}).
// Any logged-in user may read (the arena display needs it).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const key = req.nextUrl.searchParams.get("key") || "scoreboard";
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key } });
    return NextResponse.json({ key, layout: row ? JSON.parse(row.data) : {} });
  } catch {
    // Table missing (pre-migration) — behave as empty (defaults apply).
    return NextResponse.json({ key, layout: {} });
  }
}

// PUT /api/arena-layout → { key, layout } (organizer only).
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  let key = "scoreboard";
  let layout: unknown = {};
  try {
    const body = await req.json();
    key = String(body?.key || "scoreboard");
    layout = body?.layout ?? {};
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const data = JSON.stringify(layout);
  try {
    await prisma.arenaLayout.upsert({ where: { key }, create: { key, data }, update: { data } });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
