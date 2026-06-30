"use client";

import { useMemo, useState } from "react";

type RankRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  wins: number;
  losses: number;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function RankingsTable({
  list,
  currentUserId,
}: {
  list: RankRow[];
  currentUserId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q));
  }, [list, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const top3 = list.slice(0, 3);
  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  if (list.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        Ainda não há pontuações registradas no ranking.
      </div>
    );
  }

  return (
    <div>
      {/* Podium */}
      {top3.length > 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 mb-6">
          <div className="flex items-end justify-center gap-6 sm:gap-10">
            {podiumOrder.map((r) => {
              if (!r) return null;
              const rank = top3.indexOf(r) + 1;
              const isFirst = rank === 1;
              const ringColor = rank === 1 ? "ring-[#f0a500]" : rank === 2 ? "ring-gray-400" : "ring-orange-500";
              const boxColor =
                rank === 1
                  ? "bg-[#f0a500] text-black"
                  : rank === 2
                  ? "bg-gray-500 text-white"
                  : "bg-orange-600 text-white";
              return (
                <div key={r.id} className="flex flex-col items-center">
                  <div className="relative mb-2">
                    {isFirst && <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl">👑</span>}
                    <div
                      className={`rounded-full overflow-hidden ring-4 ${ringColor} ${
                        isFirst ? "w-24 h-24" : "w-20 h-20"
                      } bg-[#252525] flex items-center justify-center`}
                    >
                      {r.avatarUrl ? (
                        <img src={r.avatarUrl} alt={r.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl text-gray-500">{r.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${boxColor}`}
                    >
                      {rank}
                    </span>
                  </div>
                  <div className={`mt-3 px-4 py-2 rounded-xl text-center font-bold ${boxColor}`}>
                    <div className="text-sm">{r.name}</div>
                    <div className="text-xs opacity-80">{r.points} pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar jogador..."
          className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#f0a500] rounded-xl px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
        />
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
          className="bg-[#1a1a1a] border border-[#2a2a2a] focus:border-[#f0a500] rounded-xl px-4 py-2.5 text-white outline-none transition-colors"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-[#2a2a2a]">
          <span>Posição</span>
          <span>Jogador</span>
          <span className="text-right">Pontos</span>
        </div>
        {pageItems.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">Nenhum jogador encontrado.</p>
        ) : (
          pageItems.map((r) => {
            const idx = filtered.indexOf(r);
            const isMe = r.id === currentUserId;
            return (
              <div
                key={r.id}
                className={`grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3.5 items-center border-b border-[#222] last:border-0 ${
                  isMe ? "bg-[#f0a500]/5" : ""
                }`}
              >
                <span className="text-gray-400 font-semibold text-sm w-10">#{idx + 1}</span>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#252525] flex items-center justify-center shrink-0">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt={r.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm text-gray-500">{r.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className={`font-semibold truncate ${isMe ? "text-[#f0a500]" : "text-white"}`}>
                    {r.name}
                    {isMe && <span className="ml-2 text-xs text-gray-500">(você)</span>}
                  </span>
                </div>
                <span className="text-[#f0a500] font-bold text-right">{r.points}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#f0a500]/40"
          >
            ←
          </button>
          <span className="text-sm text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-gray-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#f0a500]/40"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
