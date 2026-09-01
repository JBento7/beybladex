"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Test tournaments only: simulate the Swiss phase (random results) and jump to
// the knockout. Shown to organizers on ROUND_ROBIN test tournaments.
export default function AutoplaySwissButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    if (!confirm("Simular a fase suíça com resultados aleatórios e gerar o mata-mata?")) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/autoplay-swiss`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Erro no autoplay");
      } else {
        router.refresh();
      }
    } catch {
      setErr("Erro de conexão");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        onClick={run}
        disabled={loading}
        className="text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-lg transition-colors"
        title="Apenas torneios de teste"
      >
        {loading ? "Simulando…" : "⏩ Autoplay fase suíça (teste)"}
      </button>
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}
