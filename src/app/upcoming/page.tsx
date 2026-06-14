import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import type { TournamentFormat, TournamentStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Próximos Torneios" };

const FORMAT_LABELS: Partial<Record<TournamentFormat, string>> & Record<string, string> = {
  ROUND_ROBIN: "Pontos Corridos",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
};

const STATUS_STYLES: Record<TournamentStatus, { label: string; style: string }> = {
  DRAFT: { label: "Rascunho", style: "bg-gray-700 text-gray-400" },
  REGISTRATION: { label: "Inscrições Abertas", style: "bg-[#f0a500]/20 text-[#f0a500]" },
  IN_PROGRESS: { label: "Em Andamento", style: "bg-green-500/20 text-green-400" },
  FINISHED: { label: "Finalizado", style: "bg-gray-700 text-gray-500" },
};

export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: { in: ["DRAFT", "REGISTRATION", "IN_PROGRESS"] },
      isTest: false,
    },
    include: {
      organizer: { select: { id: true, name: true } },
      _count: { select: { participants: true } },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">Próximos Campeonatos</h1>
          <p className="text-gray-400 mt-1">Fique por dentro dos campeonatos que estão por vir</p>
        </div>

        {tournaments.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">📅</div>
            <h2 className="text-2xl font-bold text-white mb-2">Nenhum campeonato agendado</h2>
            <p className="text-gray-400 mb-6">Volte em breve para conferir os próximos campeonatos.</p>
            <Link
              href="/tournaments"
              className="bg-[#c8102e] hover:bg-[#a00d24] text-white font-bold px-6 py-3 rounded-xl transition-colors inline-block"
            >
              Ver Todos os Torneios
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const status = STATUS_STYLES[t.status];
              return (
                <div
                  key={t.id}
                  className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/30 rounded-2xl p-6 transition-all flex flex-col"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.style}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-500 font-medium bg-[#252525] px-2.5 py-1 rounded-full">
                      {FORMAT_LABELS[t.format]}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2">{t.name}</h3>

                  {t.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{t.description}</p>
                  )}

                  {t.prize && (
                    <div className="flex items-center gap-2 mb-3 bg-[#f0a500]/10 border border-[#f0a500]/20 rounded-lg px-3 py-2">
                      <span className="text-[#f0a500] text-sm">🏆</span>
                      <span className="text-sm font-semibold text-[#f0a500]">{t.prize}</span>
                    </div>
                  )}

                  <div className="mt-auto">
                    <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                      <span>👥 {t._count.participants}{t.maxParticipants && ` / ${t.maxParticipants}`}</span>
                      <span>🎯 {t.organizer.name}</span>
                    </div>

                    {t.startDate ? (
                      <div className="text-xs text-gray-400 mb-4 bg-[#252525] rounded-lg px-3 py-2">
                        📅 {new Date(t.startDate).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    ) : (t.status === "DRAFT" || t.status === "REGISTRATION") && (
                      <div className="text-xs text-gray-400 mb-4 bg-[#252525] rounded-lg px-3 py-2">📅 Data a definir</div>
                    )}

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/tournaments/${t.id}`}
                        className="flex-1 text-center bg-[#252525] hover:bg-[#303030] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        Ver Detalhes
                      </Link>
                      {t.status === "REGISTRATION" && (
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex-1 text-center bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                          Participar
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
