"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinButton({ tournamentId }: { tournamentId: string }) {
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
      alert(data.error || "Failed to join");
    }
  }

  return (
    <button
      onClick={handleJoin}
      disabled={loading}
      className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"
    >
      {loading ? "Joining..." : "Join"}
    </button>
  );
}
