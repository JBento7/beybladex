export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { featuredBey1: true, featuredBey2: true, featuredBey3: true },
  });

  return NextResponse.json({
    featuredBey1: user?.featuredBey1 ?? null,
    featuredBey2: user?.featuredBey2 ?? null,
    featuredBey3: user?.featuredBey3 ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const ids: (string | null)[] = [body.bey1 ?? null, body.bey2 ?? null, body.bey3 ?? null];

  // Validate that provided IDs belong to this user
  const nonNull = ids.filter(Boolean) as string[];
  if (nonNull.length > 0) {
    const owned = await prisma.beyblade.findMany({
      where: { id: { in: nonNull }, userId: session.user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((b) => b.id));
    if (nonNull.some((id) => !ownedIds.has(id))) {
      return NextResponse.json({ error: "Combo inválido" }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { featuredBey1: ids[0], featuredBey2: ids[1], featuredBey3: ids[2] },
  });

  return NextResponse.json({ ok: true });
}
