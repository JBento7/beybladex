"use client";

import { useState } from "react";

export default function RecalculateBeybladeStatsButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleRecalculate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/recalculate-beyblade-stats", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          `Recálculo concluído: ${data.matchesCounted} partidas processadas, ` +
          `${data.beybladesUpdated} combo(s) corrigido(s) de ${data.beybladesTotal}.`
        );
      } else {
        setMessage(data.error || "Erro ao recalcular estatísticas.");
      }
    } catch {
      setMessage("Erro ao recalcular estatísticas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#f0a500]/30 rounded-xl p-6 mt-8">
      <h2 className="text-lg font-bold text-white mb-1">Revisar Estatísticas dos Combos</h2>
      <p className="text-gray-400 text-sm mb-4">
        Recalcula vitórias e derrotas de TODOS os combos a partir do histórico real de partidas
        (torneios oficiais). Corrige números errados deixados por resets, exclusões de torneios ou W.O.
        É seguro rodar quantas vezes quiser.
      </p>

      {message && (
        <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-[#252525] border border-[#333] text-gray-300">
          {message}
        </div>
      )}

      <button
        onClick={handleRecalculate}
        disabled={loading}
        className="bg-[#f0a500] hover:bg-[#d4940a] text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? "Recalculando..." : "Recalcular estatísticas"}
      </button>
    </div>
  );
}
