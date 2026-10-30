export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { arenaIdentity } from "@/lib/arenaIdentity";
import { listAcks, recordAck } from "@/lib/layoutStore";
import { isScreen } from "@/lib/layoutDoc";
import { errorResponse } from "@/lib/observability";

// A telão confirms which layout versions it LOADED (after the background and
// fonts were ready), per device. Only telões that really confirm are listed in
// the editor — nobody is assumed to be up to date.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const deviceId = typeof body?.deviceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.deviceId) ? body.deviceId : null;
  if (!deviceId) return NextResponse.json({ error: "Dispositivo inválido." }, { status: 400 });
  const { arena, community } = arenaIdentity(session.user.email, session.user.role, body?.n ? String(body.n) : null, body?.c ? String(body.c) : null);
  if (!arena) return NextResponse.json({ error: "Arena não identificada." }, { status: 400 });
  const versions: Record<string, number> = {};
  for (const [k, v] of Object.entries(body?.versions ?? {})) if (isScreen(k) && Number.isInteger(v)) versions[k] = v as number;
  try {
    await recordAck({ deviceId, arena: String(arena), community, account: session.user.email ?? "", versions });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse("/api/arena-layout/ack", e);
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  return NextResponse.json({ acks: await listAcks() });
}
