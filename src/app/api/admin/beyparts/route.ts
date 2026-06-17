export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { BeyPartLine, BeyPartCategory } from "@prisma/client";

const LINES: BeyPartLine[] = ["BX", "UX", "CX", "RATCHET", "BIT", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"];
const CATEGORIES: BeyPartCategory[] = ["BLADE", "RATCHET", "BIT", "LOCK_CHIP", "MAIN_BLADE", "ASSIST_BLADE", "OVER_BLADE"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const parts = await prisma.beyPart.findMany({
    orderBy: [{ line: "asc" }, { category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(parts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { line, category, name, imageUrl, statAttack, statDefense, statStamina, statHeight, statDash, statBurst } = await req.json();

  if (!LINES.includes(line)) {
    return NextResponse.json({ error: "Linha inválida" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  try {
    const part = await prisma.beyPart.create({
      data: {
        line,
        category,
        name: name.trim(),
        imageUrl: imageUrl?.trim() || null,
        statAttack: statAttack != null ? Number(statAttack) : null,
        statDefense: statDefense != null ? Number(statDefense) : null,
        statStamina: statStamina != null ? Number(statStamina) : null,
        statHeight: statHeight != null ? Number(statHeight) : null,
        statDash: statDash != null ? Number(statDash) : null,
        statBurst: statBurst != null ? Number(statBurst) : null,
      },
    });
    return NextResponse.json(part, { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "Essa peça já está cadastrada" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
