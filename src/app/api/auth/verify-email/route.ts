export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token ausente" }, { status: 400 });

  const record = await prisma.emailVerifyToken.findUnique({ where: { token } });

  if (!record) return NextResponse.json({ error: "Token inválido" }, { status: 400 });
  if (record.expiresAt < new Date()) return NextResponse.json({ error: "Token expirado" }, { status: 400 });

  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerified: true },
  });

  await prisma.emailVerifyToken.delete({ where: { id: record.id } });

  return NextResponse.redirect(new URL("/login?verified=1", req.url));
}
