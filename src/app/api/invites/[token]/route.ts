export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const invite = await prisma.organizerInvite.findUnique({
      where: { token: params.token },
    });

    if (!invite) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }

    if (invite.usedBy) {
      return NextResponse.json({ valid: false, reason: "used" });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }

    return NextResponse.json({ valid: true, expiresAt: invite.expiresAt });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
