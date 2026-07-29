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

  let initial: Record<string, Field> = {};
  try {
    const row = await prisma.arenaLayout.findUnique({ where: { key: "scoreboard" } });
    if (row) initial = JSON.parse(row.data);
  } catch {
    // table missing (pre-migration) — start from defaults
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-black text-white mb-1">Editor de layout do placar</h1>
        <p className="text-sm text-gray-400 mb-4">
          Arraste os elementos para posicionar e use a alça (canto) ou os campos numéricos para dimensionar. Salve para aplicar no telão das arenas.
        </p>
        <LayoutEditor initial={initial} />
      </div>
    </div>
  );
}
