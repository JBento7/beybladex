export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { avatarUrl } = await req.json();

  if (avatarUrl !== null && typeof avatarUrl !== "string") {
    return NextResponse.json({ error: "avatarUrl inválido" }, { status: 400 });
  }

  if (avatarUrl && avatarUrl.length > 600_000) {
    return NextResponse.json({ error: "Imagem muito grande. Use uma imagem menor." }, { status: 400 });
  }

  if (avatarUrl && !avatarUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "avatarUrl" = $1 WHERE id = $2`,
      avatarUrl ?? null,
      session.user.id
    );
  } catch (e: unknown) {
    const msg = String(e);
    if (msg.includes("avatarUrl") || msg.includes("column")) {
      return NextResponse.json({ error: "Execute /api/migrate primeiro para habilitar fotos de perfil." }, { status: 503 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
