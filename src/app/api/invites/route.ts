export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ORGANIZER") {
      return NextResponse.json({ error: "Apenas administradores podem gerar convites" }, { status: 403 });
    }
    // An invite registers an unscoped (general) admin, so a community-scoped
    // admin generating one would escalate beyond their own community.
    if (session.user.adminCommunity) {
      return NextResponse.json({ error: "Apenas o admin geral pode gerar convites de administrador." }, { status: 403 });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.organizerInvite.create({
      data: {
        createdBy: session.user.id,
        expiresAt,
      },
    });

    const headersList = headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${host}/register?invite=${invite.token}`;

    return NextResponse.json({ url, token: invite.token, expiresAt }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
