import { prisma } from "@/lib/prisma";
import type { SuggesterPart, PartWinRates } from "@/lib/combo-suggester";

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

export async function loadComboParts(): Promise<{
  blades: SuggesterPart[];
  ratchets: SuggesterPart[];
  bits: SuggesterPart[];
}> {
  const allParts = (await prisma.beyPart.findMany({ select: PART_SELECT })) as SuggesterPart[];
  return {
    blades: allParts.filter((p) => p.category === "BLADE"),
    ratchets: allParts.filter((p) => p.category === "RATCHET"),
    bits: allParts.filter((p) => p.category === "BIT"),
  };
}

// Win rate por peça: agrega Beyblade.wins/losses por campo (blade/ratchet/bit).
export async function loadPartWinRates(): Promise<PartWinRates> {
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
  return rates;
}
