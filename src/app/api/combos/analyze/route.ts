export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeCombo } from "@/lib/combo-suggester";
import { loadComboParts, loadPartWinRates } from "@/lib/combo-data";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: { bladeId?: string; ratchetId?: string; bitId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // optional
  }

  const { bladeId, ratchetId, bitId } = body;
  if (!bladeId || !ratchetId || !bitId) {
    return NextResponse.json(
      { error: "Selecione blade, ratchet e bit para analisar." },
      { status: 400 }
    );
  }

  const { blades, ratchets, bits } = await loadComboParts();

  const blade = blades.find((p) => p.id === bladeId);
  const ratchet = ratchets.find((p) => p.id === ratchetId);
  const bit = bits.find((p) => p.id === bitId);

  if (!blade || !ratchet || !bit) {
    return NextResponse.json({ error: "Peça inválida selecionada." }, { status: 400 });
  }

  const rates = await loadPartWinRates();
  const analysis = analyzeCombo(blade, ratchet, bit, rates, blades, ratchets, bits);

  return NextResponse.json({
    combo: {
      blade: { id: blade.id, name: blade.name, line: blade.line, imageUrl: blade.imageUrl },
      ratchet: { id: ratchet.id, name: ratchet.name, line: ratchet.line, imageUrl: ratchet.imageUrl },
      bit: { id: bit.id, name: bit.name, line: bit.line, imageUrl: bit.imageUrl },
    },
    analysis,
  });
}
