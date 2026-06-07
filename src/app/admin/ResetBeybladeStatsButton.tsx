"use client";

import { useState } from "react";

export default function ResetBeybladeStatsButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReset() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reset-beyblade-stats", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`${data.count} combo(s) zerados com sucesso.`);
        setConfirming(false);
      } else {
        setMessage(data.error || "Erro ao zerar estatísticas.");
      }
    } catch {
      setMessage("Erro ao zerar estatísticas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#c8102e]/30 rounded-xl p-6 mt-8">
      <h2 className="text-lg font-bold text-white mb-1">Zerar Estatísticas dos Combos</h2>
      <p className="text-gray-400 text-sm mb-4">
        Zera vitórias e derrotas de TODOS os combos de TODOS os usuários cadastrados. Essa ação não pode ser desfeita.
      </p>

      {message && (
        <div className="mb-3 text-sm px-4 py-2 rounded-lg bg-[#252525] border border-[#333] text-gray-300">
          {message}
        </div>
      )}

      {confirming ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-red-400 font-semibold">Tem certeza? Isso afeta todos os usuários.</span>
          <button
            onClick={handleReset}
            disabled={loading}
            className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Zerando..." : "Sim, zerar tudo"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="bg-[#252525] hover:bg-[#303030] border border-[#333] text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setConfirming(true); setMessage(null); }}
          className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          Zerar estatísticas de todos os combos
        </button>
      )}
    </div>
  );
}
