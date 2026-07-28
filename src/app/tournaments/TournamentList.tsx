"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";

type Tournament = {
  id: string;
  name: string;
  description: string | null;
  format: string;
  status: string;
  isOfficial: boolean;
  prize: string | null;
  startDate: string | null;
  maxParticipants: number | null;
  bannerUrl: string | null;
  location: string | null;
  entryFee: number | null;
  organizer: { name: string };
  participantCount: number;
  isJoined: boolean;
  canJoin: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  ROUND_ROBIN: "Suíço",
  GROUPS: "Grupos",
  SINGLE_ELIMINATION: "Eliminação Simples",
  SWISS: "Suíço",
};

const STATUS_STYLES: Record<string, { label: string; style: string }> = {
  DRAFT: { label: "Rascunho", style: "bg-gray-700 text-gray-400" },
  REGISTRATION: { label: "Inscrições Abertas", style: "bg-[#f0a500]/20 text-[#f0a500]" },
  IN_PROGRESS: { label: "Em Andamento", style: "bg-green-500/20 text-green-400" },
  FINISHED: { label: "Finalizado", style: "bg-gray-700 text-gray-500" },
};

export default function TournamentList({ tournaments }: { tournaments: Tournament[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tournaments;
    return tournaments.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.location ?? "").toLowerCase().includes(q) ||
        t.organizer.name.toLowerCase().includes(q)
    );
  }, [tournaments, query]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar torneios..."
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#f0a500] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
        </div>
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-sm bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-gray-300 px-4 py-2.5 rounded-xl transition-colors"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">Nenhum torneio encontrado para &quot;{query}&quot;.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t) => {
            const status = STATUS_STYLES[t.status];
            const pct = t.maxParticipants
              ? Math.min(100, Math.round((t.participantCount / t.maxParticipants) * 100))
              : null;

            return (
              <div
                key={t.id}
                className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#f0a500]/30 rounded-2xl overflow-hidden transition-all flex flex-col"
              >
                {t.bannerUrl && (
                  <img src={t.bannerUrl} alt="" className="w-full h-32 object-cover" />
                )}
                <div className="p-6 flex flex-col flex-1">
                  {/* Status badge */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.style}`}>
                        {status.label}
                      </span>
                      {!t.isOfficial && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full font-semibold">
                          🎮 BeyEncontro
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 font-medium bg-[#252525] px-2.5 py-1 rounded-full">
                      {FORMAT_LABELS[t.format]}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2">{t.name}</h3>

                  {t.description && (
                    <p className="text-sm text-gray-400 mb-4 line-clamp-2 flex-1">{t.description}</p>
                  )}

                  <div className="mt-auto">
                    {t.prize && (
                      <div className="mb-3 text-sm bg-[#f0a500]/10 border border-[#f0a500]/30 text-[#f0a500] px-3 py-2 rounded-lg font-medium">
                        🏆 {t.prize}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-sm text-gray-500 mb-2 flex-wrap">
                      <span>🎯 {t.organizer.name}</span>
                      {t.location && <span>📍 {t.location}</span>}
                      {t.entryFee !== null && (
                        <span className="text-green-400">
                          💵 R$ {t.entryFee.toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </div>

                    {t.startDate ? (
                      <div className="text-xs text-gray-500 mb-3">
                        📅 {new Date(t.startDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </div>
                    ) : (t.status === "DRAFT" || t.status === "REGISTRATION") && (
                      <div className="text-xs text-gray-500 mb-3">📅 Data a definir</div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span>
                        👥 {t.participantCount}
                        {t.maxParticipants && ` / ${t.maxParticipants}`}
                      </span>
                      {pct !== null && <span className="ml-auto">{pct}%</span>}
                    </div>
                    {t.maxParticipants && (
                      <div className="h-1.5 bg-[#252525] rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full bg-[#f0a500] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {!t.maxParticipants && <div className="mb-4" />}

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/tournaments/${t.id}`}
                        className="flex-1 text-center bg-[#252525] hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                      >
                        Ver Detalhes
                      </Link>
                      <ShareButton url={`/tournaments/${t.id}`} title={t.name} className="w-9 h-9" />
                      {t.isJoined ? (
                        <span className="flex-1 text-center bg-green-500/20 text-green-400 text-sm font-medium px-4 py-2 rounded-lg border border-green-500/30">
                          ✓ Inscrito
                        </span>
                      ) : t.canJoin ? (
                        <Link
                          href={`/tournaments/${t.id}`}
                          className="flex-1 text-center bg-[#f0a500] hover:bg-[#d4940a] text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                        >
                          Participar
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
