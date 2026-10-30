import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { prisma } from "@/lib/prisma";
import { getLibrary, getPublished, type Published } from "@/lib/layoutStore";
import type { Screen } from "@/lib/layoutDoc";
import LayoutEditor from "./LayoutEditor";

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

  // The signed-in organizer's photo and beys as defaults for the sample data
  // (only read; the preview never changes profiles, matches or events).
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, bladerName: true, avatarUrl: true } });
  let deck: (string | null)[] = [];
  try {
    const beys = await prisma.beyblade.findMany({ where: { userId: session.user.id }, select: { blade: true }, take: 3 });
    deck = await Promise.all(beys.map(async (b) => {
      if (!b.blade) return null;
      const part = await prisma.beyPart.findFirst({ where: { name: b.blade, category: { in: ["BLADE", "MAIN_BLADE"] }, imageUrl: { not: null } }, select: { imageUrl: true } });
      return part?.imageUrl ?? null;
    }));
  } catch { /* no beys */ }
  const profile = { name: me?.bladerName || me?.name || "JOGADOR", avatar: me?.avatarUrl ?? null, deck };

  return (
    <div className="min-h-screen bg-app">
      <Navbar />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
        <h1 className="text-2xl font-black text-white mb-1">Editor de layout do placar</h1>
        <p className="text-sm text-gray-400 mb-4">
          Editar → Pré-visualizar → <b className="text-gray-200">Aplicar no telão</b>. Nada muda nas arenas antes de aplicar; o rascunho fica salvo neste aparelho.
        </p>
        <LayoutEditor published={published} library={library} profile={profile} />
      </div>
    </div>
  );
}
