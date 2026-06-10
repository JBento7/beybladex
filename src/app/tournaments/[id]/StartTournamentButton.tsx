"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartTournamentButton({
  tournamentId,
  defaultArenas = 1,
}: {
  tournamentId: string;
  defaultArenas?: number;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [arenas, setArenas] = useState(defaultArenas);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arenas }),
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
      {err && <p className="text-sm text-red-400">{err}</p>}

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => !loading && setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md"
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
