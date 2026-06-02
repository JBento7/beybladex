"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientJoinButton({ tournamentId }: { tournamentId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleJoin() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/join`, {
      method: "POST",
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao se inscrever no torneio");
    }
  }

  return (
    <button
      onClick={handleJoin}
      disabled={loading}
      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold px-6 py-2.5 rounded-xl transition-colors"
    >
      {loading ? "Inscrevendo..." : "Participar do Torneio"}
    </button>
  );
}
