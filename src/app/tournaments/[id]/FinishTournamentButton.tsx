"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FinishTournamentButton({
  tournamentId,
  isOfficial,
}: {
  tournamentId: string;
  isOfficial: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirm() {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/finish`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      setShowModal(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Erro ao encerrar");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={() => setShowModal(true)}
        className="bg-[#c8102e] hover:bg-[#a30d25] text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
      >
        🏁 Encerrar {isOfficial ? "Torneio" : "BeyEncontro"}
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
            className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md"
          >
            <h2 className="text-lg font-bold text-white mb-1">
              Encerrar {isOfficial ? "torneio" : "BeyEncontro"}?
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Partidas que ainda não foram finalizadas serão ignoradas e a classificação final
              será calculada apenas com os resultados já registrados. Essa ação não pode ser
              desfeita.
            </p>

            <div className="bg-amber-900/20 border border-amber-700/30 text-amber-300 text-xs px-4 py-3 rounded-lg mb-5">
              ⚠️ Use isso apenas se o evento não puder continuar (ex: falta de tempo ou
              participantes que não compareceram).
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
                className="flex-1 bg-[#c8102e] hover:bg-[#a30d25] disabled:opacity-60 text-white font-bold py-2.5 rounded-xl transition-colors"
              >
                {loading ? "Encerrando..." : "Confirmar e encerrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
