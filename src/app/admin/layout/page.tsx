import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { prisma } from "@/lib/prisma";
import type { Field } from "@/lib/arenaLayout";
import LayoutEditor from "./LayoutEditor";

export const dynamic = "force-dynamic";

export default async function ArenaLayoutPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ORGANIZER") redirect("/dashboard");

  const initial: { scoreboard: Record<string, Field>; winner: Record<string, Field> } = { scoreboard: {}, winner: {} };
  try {
    const rows = await prisma.arenaLayout.findMany({ where: { key: { in: ["scoreboard", "winner"] } } });
    for (const row of rows) {
      if (row.key === "scoreboard") initial.scoreboard = JSON.parse(row.data);
      if (row.key === "winner") initial.winner = JSON.parse(row.data);
    }
  } catch {
    // table missing (pre-migration) — start from defaults
  }

  // The signed-in organizer's profile is used as sample data in the preview.
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, bladerName: true, avatarUrl: true },
  });
  const profile = { name: me?.bladerName || me?.name || "JOGADOR", avatar: me?.avatarUrl ?? null };

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black text-white mb-1">Editor de layout do placar</h1>
        <p className="text-sm text-gray-400 mb-4">
          Arraste os elementos para posicionar e use a alça (canto) ou os campos numéricos para dimensionar. Salve para aplicar no telão das arenas.
        </p>
        <LayoutEditor initial={initial} profile={profile} />
      </div>
    </div>
  );
}
