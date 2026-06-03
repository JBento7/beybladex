export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { avatarUrl } = await req.json();

  // Allow clearing avatar (null) or setting a base64 data URL
  if (avatarUrl !== null && typeof avatarUrl !== "string") {
    return NextResponse.json({ error: "avatarUrl inválido" }, { status: 400 });
  }

  // Limit size: base64 of a 200x200 JPEG is ~20KB, allow up to 500KB
  if (avatarUrl && avatarUrl.length > 600_000) {
    return NextResponse.json({ error: "Imagem muito grande. Máximo 400KB." }, { status: 400 });
  }

  if (avatarUrl && !avatarUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "Formato de imagem inválido." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatarUrl: avatarUrl ?? null },
  });

  return NextResponse.json({ ok: true });
}
