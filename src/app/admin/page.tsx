import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import AdminPanel from "./AdminPanel";
import UserManager from "./UserManager";
import ResetTokenManager from "./ResetTokenManager";
import TournamentManager from "./TournamentManager";
import ResetBeybladeStatsButton from "./ResetBeybladeStatsButton";
import type { TournamentFormat, TournamentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FORMAT_LABELS: Partial<Record<TournamentFormat, string>> & Record<string, string> = {
  ROUND_ROBIN: "Pontos Corridos",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
};

const STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  REGISTRATION: "Inscrições",
  IN_PROGRESS: "Em Andamento",
  FINISHED: "Finalizado",
};

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ORGANIZER") {
    redirect("/dashboard");
  }

  const allTournaments = await prisma.tournament.findMany({
    include: {
      organizer: { select: { id: true, name: true, role: true } },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const officialTournaments = allTournaments.filter(
    (t) => t.organizer.role === "ORGANIZER"
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black text-white">Painel Admin</h1>
              <span className="bg-[#f0a500] text-black text-xs font-black px-2.5 py-1 rounded-full">
                ADMIN
              </span>
            </div>
            <p className="text-gray-400">Gerencie torneios oficiais da LBL</p>
          </div>
        </div>

        {/* Create Official Tournament */}
        <AdminPanel />

        {/* Official Tournaments List */}
        <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Torneios Oficiais</h2>
          {officialTournaments.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">Nenhum torneio oficial criado ainda</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a] text-gray-400">
                    <th className="text-left py-3 px-2 font-medium">Nome</th>
                    <th className="text-left py-3 px-2 font-medium">Formato</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Participantes</th>
                    <th className="text-left py-3 px-2 font-medium">Prêmio</th>
                    <th className="text-left py-3 px-2 font-medium">Organizador</th>
                    <th className="text-left py-3 px-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a2a]">
                  {officialTournaments.map((t) => (
                    <tr key={t.id} className="hover:bg-[#252525] transition-colors">
                      <td className="py-3 px-2 font-medium text-white">{t.name}</td>
                      <td className="py-3 px-2 text-gray-400">{FORMAT_LABELS[t.format]}</td>
                      <td className="py-3 px-2">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          t.status === "IN_PROGRESS" ? "bg-green-500/20 text-green-400"
                          : t.status === "REGISTRATION" ? "bg-[#f0a500]/20 text-[#f0a500]"
                          : t.status === "FINISHED" ? "bg-gray-700 text-gray-400"
                          : "bg-gray-700 text-gray-500"
                        }`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-400">{t._count.participants}{t.maxParticipants ? ` / ${t.maxParticipants}` : ""}</td>
                      <td className="py-3 px-2 text-[#f0a500]">{t.prize || "—"}</td>
                      <td className="py-3 px-2 text-gray-400">{t.organizer.name}</td>
                      <td className="py-3 px-2">
                        <a
                          href={`/tournaments/${t.id}`}
                          className="text-[#c8102e] hover:text-[#f0a500] transition-colors font-medium"
                        >
                          Ver →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tournament Management */}
        <TournamentManager />

        {/* User Management */}
        <UserManager />

        {/* Reset Token Management */}
        <ResetTokenManager />

        {/* Reset Beyblade Stats */}
        <ResetBeybladeStatsButton />
      </main>
    </div>
  );
}
