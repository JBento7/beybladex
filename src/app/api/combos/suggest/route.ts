export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestCombos, type ComboStyle } from "@/lib/combo-suggester";
import { loadComboParts, loadPartWinRates } from "@/lib/combo-data";

const VALID_STYLES: ComboStyle[] = ["ATTACK", "DEFENSE", "STAMINA"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const styleParam = (req.nextUrl.searchParams.get("style") || "ATTACK").toUpperCase();
  const style: ComboStyle = VALID_STYLES.includes(styleParam as ComboStyle)
    ? (styleParam as ComboStyle)
    : "ATTACK";

  // "owned" = sugerir só com as peças que o usuário tem cadastradas.
  const ownedOnly = req.nextUrl.searchParams.get("owned") === "1";

  let { blades, ratchets, bits } = await loadComboParts();

  if (ownedOnly) {
    const myBeys = await prisma.beyblade.findMany({
      where: { userId: session.user.id },
      select: { blade: true, ratchet: true, bit: true },
    });
    const ownedBlades = new Set(myBeys.map((b) => b.blade).filter(Boolean) as string[]);
    const ownedRatchets = new Set(myBeys.map((b) => b.ratchet).filter(Boolean) as string[]);
    const ownedBits = new Set(myBeys.map((b) => b.bit).filter(Boolean) as string[]);
    blades = blades.filter((p) => ownedBlades.has(p.name));
    ratchets = ratchets.filter((p) => ownedRatchets.has(p.name));
    bits = bits.filter((p) => ownedBits.has(p.name));
  }

  const rates = await loadPartWinRates();
  const suggestions = suggestCombos(blades, ratchets, bits, rates, style);

  return NextResponse.json({
    style,
    ownedOnly,
    counts: { blades: blades.length, ratchets: ratchets.length, bits: bits.length },
    suggestions,
  });
}
