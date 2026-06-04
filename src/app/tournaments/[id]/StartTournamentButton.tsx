"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function handleStart() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/start`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao iniciar torneio");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleStart}
          disabled={loading}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
        >
          {loading ? "Iniciando..." : confirming ? "Confirmar início?" : "🚀 Iniciar Torneio"}
        </button>
        {confirming && !loading && (
          <button
            onClick={() => setConfirming(false)}
            className="text-sm text-gray-400 hover:text-white px-3 py-2.5 rounded-xl transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
