export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  suggestCombos,
  type ComboStyle,
  type SuggesterPart,
  type PartWinRates,
} from "@/lib/combo-suggester";

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

  const select = {
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

  const allParts = (await prisma.beyPart.findMany({ select })) as SuggesterPart[];

  let blades = allParts.filter((p) => p.category === "BLADE");
  let ratchets = allParts.filter((p) => p.category === "RATCHET");
  let bits = allParts.filter((p) => p.category === "BIT");

  // Filtro "só minhas peças": restringe aos nomes que o usuário possui.
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

  // Win rate por peça: agrega Beyblade.wins/losses por campo (blade/ratchet/bit).
  // Só conta combos com pelo menos uma partida para não diluir os dados.
  const beys = await prisma.beyblade.findMany({
    where: { OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }] },
    select: { blade: true, ratchet: true, bit: true, wins: true, losses: true },
  });

  const rates: PartWinRates = {};
  const tally = (name: string | null, wins: number, losses: number) => {
    if (!name) return;
    const r = (rates[name] ??= { wins: 0, losses: 0 });
    r.wins += wins;
    r.losses += losses;
  };
  for (const b of beys) {
    tally(b.blade, b.wins, b.losses);
    tally(b.ratchet, b.wins, b.losses);
    tally(b.bit, b.wins, b.losses);
  }

  const suggestions = suggestCombos(blades, ratchets, bits, rates, style);

  return NextResponse.json({
    style,
    ownedOnly,
    counts: { blades: blades.length, ratchets: ratchets.length, bits: bits.length },
    suggestions,
  });
}
