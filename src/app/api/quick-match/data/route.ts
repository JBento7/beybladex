export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Data for the Partidas Rápidas setup: registered players (with their beys)
// so they can pick/order a deck, plus BeyParts pieces so a guest can build a
// combo on the fly.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        deleted: false,
        isGuest: false,
        email: { not: { endsWith: "@lbl.arena" } },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        bladerName: true,
        avatarUrl: true,
        beyblades: {
          where: { hiddenFromCommunity: false },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, blade: true, ratchet: true, bit: true },
        },
      },
    });

    const parts = await prisma.beyPart.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, category: true, name: true, fullName: true, imageUrl: true },
    });

    return NextResponse.json({ players: users, parts });
  } catch (err) {
    console.error("[quick-match data GET]", err);
    return NextResponse.json(
      { error: "Erro ao carregar dados. Pode faltar rodar a migração (/api/migrate)." },
      { status: 500 }
    );
  }
}
