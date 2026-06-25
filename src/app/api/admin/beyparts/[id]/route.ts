export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Propaga a renomeação de uma peça aos combos (Beyblade) que usam o nome antigo,
// no campo correspondente à categoria da peça.
async function renameInCombos(category: string, oldName: string, newName: string) {
  switch (category) {
    case "BLADE":
      await prisma.beyblade.updateMany({ where: { blade: oldName }, data: { blade: newName } });
      break;
    case "RATCHET":
      await prisma.beyblade.updateMany({ where: { ratchet: oldName }, data: { ratchet: newName } });
      break;
    case "BIT":
      await prisma.beyblade.updateMany({ where: { bit: oldName }, data: { bit: newName } });
      break;
    case "LOCK_CHIP":
      await prisma.beyblade.updateMany({ where: { lockChip: oldName }, data: { lockChip: newName } });
      break;
    case "MAIN_BLADE":
      await prisma.beyblade.updateMany({ where: { metalBlade: oldName }, data: { metalBlade: newName } });
      break;
    case "ASSIST_BLADE":
      await prisma.beyblade.updateMany({ where: { assistBlade: oldName }, data: { assistBlade: newName } });
      break;
    case "OVER_BLADE":
      await prisma.beyblade.updateMany({ where: { overBlade: oldName }, data: { overBlade: newName } });
      break;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { name, fullName, imageUrl, partType, weight, statAttack, statDefense, statStamina, statHeight, statDash, statBurst } = await req.json();

  const existing = await prisma.beyPart.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Peça não encontrada" }, { status: 404 });
  }

  // Validate name (renaming is allowed to fix typos).
  let newName = existing.name;
  if (name != null) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }
    newName = name.trim();
  }

  try {
    const updated = await prisma.beyPart.update({
      where: { id: params.id },
      data: {
        name: newName,
        fullName: fullName?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        partType: partType?.trim() || null,
        weight: weight != null && weight !== "" ? Number(weight) : null,
        statAttack: statAttack != null ? Number(statAttack) : null,
        statDefense: statDefense != null ? Number(statDefense) : null,
        statStamina: statStamina != null ? Number(statStamina) : null,
        statHeight: statHeight != null ? Number(statHeight) : null,
        statDash: statDash != null ? Number(statDash) : null,
        statBurst: statBurst != null ? Number(statBurst) : null,
      },
    });

    // Se o nome (simplificado) mudou, atualiza os combos que referenciam o nome antigo.
    if (newName !== existing.name) {
      await renameInCombos(existing.category, existing.name, newName);
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe uma peça com esse nome simplificado nessa linha/categoria" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  await prisma.beyPart.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
