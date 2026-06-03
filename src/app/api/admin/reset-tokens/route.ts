export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tokens = await prisma.passwordResetToken.findMany({
    where: {
      used: false,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tokens);
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { used: true },
        { expiresAt: { lt: new Date() } },
      ],
    },
  });

  return NextResponse.json({ ok: true });
}
