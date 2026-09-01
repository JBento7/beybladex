import { prisma } from "@/lib/prisma";

// Map a beyblade line to the BeyPart line used for its blades.
function partLineFor(beyLine: string | null | undefined): string {
  switch (beyLine) {
    case "UX": return "UX";
    case "BX_EXPAND": return "BX_EXPAND";
    case "UX_EXPAND": return "UX_EXPAND";
    case "CX": return "CX";
    case "CX_EXPAND": return "CX_EXPAND";
    default: return "BX";
  }
}

type Parts = {
  blade?: string | null; ratchet?: string | null; bit?: string | null;
  lockChip?: string | null; metalBlade?: string | null; assistBlade?: string | null; overBlade?: string | null;
};

// When a beyblade is registered with parts that aren't in the BeyParts catalog
// yet, create a stub entry (no image) so the part exists in the catalog and an
// admin can add its image once — then every bey using it shows the art. Safe &
// idempotent; never throws (best-effort).
export async function ensureBeyParts(beyLine: string | null | undefined, parts: Parts): Promise<void> {
  const line = partLineFor(beyLine);
  const entries: { line: string; category: string; name: string }[] = [];
  const add = (name: string | null | undefined, category: string, l: string) => {
    const n = name?.trim();
    if (n) entries.push({ line: l, category, name: n });
  };
  add(parts.blade, "BLADE", line);
  add(parts.metalBlade, "MAIN_BLADE", line);
  add(parts.assistBlade, "ASSIST_BLADE", line);
  add(parts.lockChip, "LOCK_CHIP", line);
  add(parts.overBlade, "OVER_BLADE", "CX_EXPAND");
  add(parts.ratchet, "RATCHET", "RATCHET");
  add(parts.bit, "BIT", "BIT");

  for (const e of entries) {
    try {
      const exists = await prisma.beyPart.findFirst({
        where: { category: { in: [e.category] as never }, name: { equals: e.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (!exists) {
        await prisma.beyPart.create({ data: { line: e.line as never, category: e.category as never, name: e.name } });
      }
    } catch {
      /* catalog write is best-effort — never block bey registration */
    }
  }
}
