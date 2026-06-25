export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const parts = await prisma.beyPart.findMany({
    orderBy: [{ line: "asc" }, { category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      line: true,
      category: true,
      name: true,
      imageUrl: true,
      partType: true,
      weight: true,
      statAttack: true,
      statDefense: true,
      statStamina: true,
      statHeight: true,
      statDash: true,
      statBurst: true,
    },
  });

  return NextResponse.json(parts);
}
