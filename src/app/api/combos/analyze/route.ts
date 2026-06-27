export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeComboParts, type SuggesterPart } from "@/lib/combo-suggester";
import { loadPartWinRates } from "@/lib/combo-data";
import { slotsForLine, COMBO_LINES, type ComboLine } from "@/lib/combo-lines";

const PART_SELECT = {
  id: true,
  line: true,
  category: true,
  name: true,
  imageUrl: true,
  statAttack: true,
  statDefense: true,
  statStamina: true,
  statBurst: true,
  statDash: true,
  statHeight: true,
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { line?: string; partIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // optional
  }

  const line = body.line as ComboLine | undefined;
  if (!line || !COMBO_LINES.includes(line)) {
    return NextResponse.json({ error: "Escolha uma linha válida." }, { status: 400 });
  }

  const slots = slotsForLine(line);
  const partIds = Array.isArray(body.partIds) ? body.partIds : [];

  if (partIds.length !== slots.length || partIds.some((id) => !id)) {
    return NextResponse.json(
      { error: "Selecione todas as peças do combo antes de analisar." },
      { status: 400 }
    );
  }

  const allParts = (await prisma.beyPart.findMany({ select: PART_SELECT })) as SuggesterPart[];

  // Pools por slot (opções candidatas) e a peça escolhida em cada slot.
  const slotPools: SuggesterPart[][] = [];
  const selected: SuggesterPart[] = [];
  const comboParts: { key: string; label: string; part: SuggesterPart }[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const pool = allParts.filter(
      (p) => p.category === slot.category && slot.lines.includes(p.line)
    );
    const chosen = pool.find((p) => p.id === partIds[i]);
    if (!chosen) {
      return NextResponse.json(
        { error: `Peça inválida para o slot "${slot.label}".` },
        { status: 400 }
      );
    }
    slotPools.push(pool);
    selected.push(chosen);
    comboParts.push({ key: slot.key, label: slot.label, part: chosen });
  }

  const rates = await loadPartWinRates();
  const analysis = analyzeComboParts(selected, slotPools, rates);

  return NextResponse.json({
    line,
    combo: comboParts.map((c) => ({
      key: c.key,
      label: c.label,
      id: c.part.id,
      name: c.part.name,
      line: c.part.line,
      imageUrl: c.part.imageUrl,
    })),
    analysis,
  });
}
