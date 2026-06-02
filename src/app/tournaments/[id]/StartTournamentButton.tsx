"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartTournamentButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleStart() {
    if (!confirm("Iniciar o torneio? Isso vai gerar todas as partidas.")) return;
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/start`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao iniciar torneio");
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
    >
      {loading ? "Iniciando..." : "🚀 Iniciar Torneio"}
    </button>
  );
}
