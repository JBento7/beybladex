export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupPartWeight } from "@/lib/partWeights";

// Preenche o peso das peças que ainda não têm peso definido, usando os valores
// de referência pesquisados (lib/partWeights). Não sobrescreve pesos já editados.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const parts = await prisma.beyPart.findMany({
    where: { weight: null },
    select: { id: true, name: true },
  });

  let updated = 0;
  for (const part of parts) {
    const weight = lookupPartWeight(part.name);
    if (weight != null) {
      await prisma.beyPart.update({ where: { id: part.id }, data: { weight } });
      updated++;
    }
  }

  return NextResponse.json({ updated, scanned: parts.length });
}
