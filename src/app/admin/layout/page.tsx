import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { prisma } from "@/lib/prisma";
import { getLibrary, getPublished, type Published } from "@/lib/layoutStore";
import type { Screen } from "@/lib/layoutDoc";
import LayoutEditor from "./LayoutEditor";
import { buildExamples, type BeyExample, type BeyKind, type CatalogPart } from "@/lib/beyExamples";

/** Demonstration Beyblades (BX, UX, CX, CX Expand) from the catalog, read ONCE
 *  per page load: the list without images first, then only the images of the
 *  chosen parts (catalog images may be large data URLs). */
async function loadExamples(): Promise<Record<BeyKind, BeyExample>> {
  let rows: { id: string; line: string; category: string; name: string; hasImg: boolean }[] = [];
  try {
    rows = await prisma.$queryRaw`SELECT id, line::text AS line, category::text AS category, name, ("imageUrl" IS NOT NULL AND "imageUrl" <> '') AS "hasImg"
      FROM "BeyPart" WHERE category::text IN ('BLADE','LOCK_CHIP','MAIN_BLADE','ASSIST_BLADE','OVER_BLADE','RATCHET','BIT')`;
  } catch { /* no catalog: markers only */ }
  const parts: CatalogPart[] = rows.map((r) => ({ line: r.line, category: r.category, name: r.name, imageUrl: r.hasImg ? `catalog:${r.id}` : null }));
  const ex = buildExamples(parts);
  const ids = new Set<string>();
  for (const e of Object.values(ex)) for (const p of e.parts) if (p.src.startsWith("catalog:")) ids.add(p.src.slice(8));
  const urls = new Map((ids.size ? await prisma.beyPart.findMany({ where: { id: { in: [...ids] } }, select: { id: true, imageUrl: true } }) : []).map((r) => [`catalog:${r.id}`, r.imageUrl ?? ""]));
  const real = (src: string | null) => (src && src.startsWith("catalog:") ? urls.get(src) || null : src);
  for (const e of Object.values(ex)) {
    e.img = real(e.img);
    if (e.pieces) e.pieces = { ...e.pieces, lock: real(e.pieces.lock), metal: real(e.pieces.metal), assist: real(e.pieces.assist), over: real(e.pieces.over) };
    e.parts = e.parts.map((p) => ({ ...p, src: real(p.src) ?? p.src }));
  }
  return ex;
}

export const dynamic = "force-dynamic";

// Layout editor (docs/EDITOR-LAYOUT.md): Editar → Pré-visualizar → Aplicar no
// telão. Starts from the PUBLISHED versions; drafts stay on this device until
// applied. Organizers only (same permission as before).
export default async function ArenaLayoutPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") redirect("/dashboard");

  const screens: Screen[] = ["scoreboard", "winner", "quickmatch"];
  const published = Object.fromEntries(await Promise.all(screens.map(async (s) => [s, await getPublished(s)] as const))) as Record<Screen, Published>;
  const library = await getLibrary();

  // The signed-in organizer's photo/name as sample defaults (only read; the
  // preview never changes profiles, matches or events). Beyblades come from
  // the catalog examples, never from the admin's own beys.
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, bladerName: true, avatarUrl: true } });
  const profile = { name: me?.bladerName || me?.name || "JOGADOR", avatar: me?.avatarUrl ?? null };
  const examples = await loadExamples();

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
        <h1 className="text-2xl font-black text-white mb-1">Editor de layout do placar</h1>
        <p className="text-sm text-gray-400 mb-4">
          Editar → Pré-visualizar → <b className="text-gray-200">Aplicar no telão</b>. Nada muda nas arenas antes de aplicar; o rascunho fica salvo neste aparelho.
        </p>
        <LayoutEditor published={published} library={library} profile={profile} examples={examples} />
      </div>
    </div>
  );
}
