export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureKioskAccounts, kioskCommunity } from "@/lib/kioskAccounts";

// Creates the 5 judge kiosk accounts juizN@<liga>.juiz — a tablet handed to a
// judge, which scores only its league's matches.
// POST { c?: "lbl" | "lbm", rotate?: boolean } — admin only; a league admin acts
// only on their own league. New accounts get a random password returned ONCE
// in this response (never logged); rotate=true replaces existing passwords.
export async function GET() {
  return NextResponse.json({ error: "Use POST (Admin → Contas de arena e juiz)." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { c?: unknown; rotate?: unknown };
  const community = kioskCommunity(session, body.c);
  const users = await ensureKioskAccounts({ kind: "juiz", community, rotate: body.rotate === true, session });
  return NextResponse.json(
    { community, users, note: "Anote as senhas agora: elas não são mostradas de novo." },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
