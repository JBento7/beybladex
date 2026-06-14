"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type JudgeCandidate = {
  id: string;
  name: string;
  isAdmin: boolean;
  isParticipant: boolean;
};

export default function StartTournamentButton({
  tournamentId,
  defaultArenas = 1,
  candidates = [],
  allowJudges = false,
}: {
  tournamentId: string;
  defaultArenas?: number;
  candidates?: JudgeCandidate[];
  allowJudges?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [arenas, setArenas] = useState(defaultArenas);
  const [judgeCount, setJudgeCount] = useState(0);
  const [selectedJudges, setSelectedJudges] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function toggleJudge(id: string) {
    setSelectedJudges((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleConfirm() {
    setErr(null);
    if (allowJudges && judgeCount > 0 && selectedJudges.length !== judgeCount) {
      setErr(`Selecione exatamente ${judgeCount} juiz(es). Selecionados: ${selectedJudges.length}.`);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arenas,
        judgeIds: allowJudges ? selectedJudges : [],
      }),
    });
    setLoading(false);
    if (res.ok) {
      setShowModal(false);
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao iniciar torneio");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={() => setShowModal(true)}
        className="bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
      >
        🚀 Iniciar Torneio
      </button>
      {err && !showModal && <p className="text-sm text-red-400">{err}</p>}

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => !loading && setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <h2 className="text-lg font-bold text-white mb-1">Confirmar início do torneio</h2>
            <p className="text-sm text-gray-400 mb-4">
              Confirme o número de arenas disponíveis. As partidas serão geradas e distribuídas
              entre as arenas com base nesse número — depois de geradas, essa configuração não
              pode ser alterada.
            </p>

            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Número de arenas
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={arenas}
              onChange={(e) => setArenas(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors mb-4"
            />

            {allowJudges && (
              <>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Quantidade de juízes
                </label>
                <input
                  type="number"
                  min={0}
                  max={candidates.length}
                  value={judgeCount}
                  onChange={(e) =>
                    setJudgeCount(Math.max(0, Math.min(candidates.length, parseInt(e.target.value) || 0)))
                  }
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] rounded-lg px-4 py-2.5 text-white outline-none transition-colors mb-3"
                />

                {judgeCount > 0 && (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-gray-300">
                        Selecione os juízes
                      </label>
                      <span
                        className={`text-xs font-semibold ${
                          selectedJudges.length === judgeCount ? "text-green-400" : "text-gray-400"
                        }`}
                      >
                        {selectedJudges.length} / {judgeCount}
                      </span>
                    </div>
                    {candidates.length === 0 ? (
                      <p className="text-xs text-gray-500 mb-4">Nenhum candidato disponível.</p>
                    ) : (
                      <div className="max-h-52 overflow-y-auto rounded-lg border border-[#333] divide-y divide-[#2a2a2a] mb-1">
                        {candidates.map((c) => {
                          const checked = selectedJudges.includes(c.id);
                          const disabled =
                            !checked && selectedJudges.length >= judgeCount;
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                                disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-[#252525]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleJudge(c.id)}
                                className="w-4 h-4 accent-[#f0a500]"
                              />
                              <span className="text-sm text-white flex-1 truncate">{c.name}</span>
                              {c.isAdmin && (
                                <span className="text-[10px] bg-[#f0a500]/20 text-[#f0a500] px-1.5 py-0.5 rounded font-semibold">
                                  ADMIN
                                </span>
                              )}
                              {c.isParticipant && (
                                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-semibold">
                                  JOGADOR
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mb-4">
                      Juízes que também são jogadores não terão partida em paralelo enquanto
                      estiverem arbitrando.
                    </p>
                  </>
                )}
              </>
            )}

            <div className="bg-amber-900/20 border border-amber-700/30 text-amber-300 text-xs px-4 py-3 rounded-lg mb-5">
              ⚠️ O resultado de uma partida afeta apenas os jogadores dela — partidas em arenas
              diferentes podem ser disputadas e finalizadas em paralelo, sem interferir umas nas
              outras.
            </div>

            {err && (
              <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                {err}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="flex-1 bg-[#252525] hover:bg-[#333] disabled:opacity-50 text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors"
              >
                {loading ? "Iniciando..." : "Confirmar e iniciar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
