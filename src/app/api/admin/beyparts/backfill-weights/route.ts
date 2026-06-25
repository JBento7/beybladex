export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupPartWeight } from "@/lib/partWeights";

// Preenche o peso das peças a partir da tabela de referência (lib/partWeights).
// Por padrão preenche só as peças sem peso; com ?overwrite=1 aplica a tabela
// também sobre os pesos já existentes (útil ao atualizar pela planilha oficial).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const overwrite = req.nextUrl.searchParams.get("overwrite") === "1";

  const parts = await prisma.beyPart.findMany({
    where: overwrite ? {} : { weight: null },
    select: { id: true, name: true, weight: true },
  });

  let updated = 0;
  for (const part of parts) {
    const weight = lookupPartWeight(part.name);
    if (weight != null && weight !== part.weight) {
      await prisma.beyPart.update({ where: { id: part.id }, data: { weight } });
      updated++;
    }
  }

  return NextResponse.json({ updated, scanned: parts.length, overwrite });
}
