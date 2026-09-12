export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Tiny signaling mailbox for the arena↔judge WebRTC pairing, stored per arena in
// ArenaLayout. Non-trickle SDP: the judge posts an offer, the telão posts an
// answer; once connected, data flows peer-to-peer over the LAN (works offline).
// Keys: rtc:<arena>:offer  and  rtc:<arena>:ans  (JSON { id, sdp, ts }).
const TTL = 60_000;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const arena = req.nextUrl.searchParams.get("arena");
  const want = req.nextUrl.searchParams.get("want"); // "offer" | "answer"
  if (!arena || !want) return NextResponse.json({ error: "Parâmetros" }, { status: 400 });
  try {
    const key = `rtc:${arena}:${want === "offer" ? "offer" : "ans"}`;
    const row = await prisma.arenaLayout.findUnique({ where: { key } });
    if (!row) return NextResponse.json({ signal: null });
    const data = JSON.parse(row.data);
    if (!data?.ts || Date.now() - data.ts > TTL) return NextResponse.json({ signal: null });
    return NextResponse.json({ signal: data });
  } catch {
    return NextResponse.json({ signal: null });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const arena = String(body?.arena ?? "");
  const role = body?.role === "answer" ? "ans" : "offer";
  const id = String(body?.id ?? "");
  const sdp = body?.sdp;
  if (!arena || !id || !sdp) return NextResponse.json({ error: "Parâmetros" }, { status: 400 });
  try {
    const key = `rtc:${arena}:${role}`;
    const data = JSON.stringify({ id, sdp, ts: Date.now() });
    await prisma.arenaLayout.upsert({ where: { key }, create: { key, data }, update: { data } });
  } catch {
    return NextResponse.json({ error: "Tabela ArenaLayout ausente — rode /api/migrate" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
