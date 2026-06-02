"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FINISH_TYPE_LABELS, FINISH_TYPE_DESCRIPTIONS, FINISH_TYPE_POINTS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

const FINISH_TYPES: FinishType[] = ["SPIN_FINISH", "OVER_FINISH", "BURST_FINISH", "EXTREME_FINISH"];

type Player = { id: string; name: string };

export default function ScoreModal({
  matchId,
  player1,
  player2,
  tournamentId,
}: {
  matchId: string;
  player1: Player;
  player2: Player;
  tournamentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [winnerId, setWinnerId] = useState("");
  const [finishType, setFinishType] = useState<FinishType>("SPIN_FINISH");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!winnerId) {
      alert("Selecione um vencedor");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId, finishType }),
    });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao salvar placar");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        Placar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">Registrar Placar</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Winner selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Vencedor</label>
                <div className="grid grid-cols-2 gap-3">
                  {[player1, player2].map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setWinnerId(player.id)}
                      className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                        winnerId === player.id
                          ? "border-amber-500 bg-amber-500/15 text-amber-400"
                          : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Finish type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Finish</label>
                <div className="space-y-2">
                  {FINISH_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFinishType(type)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        finishType === type
                          ? "border-amber-500 bg-amber-500/10"
                          : "border-gray-700 bg-gray-800 hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${finishType === type ? "text-amber-400" : "text-white"}`}>
                          {FINISH_TYPE_LABELS[type]}
                        </span>
                        <span className={`text-sm font-bold ${finishType === type ? "text-amber-400" : "text-gray-500"}`}>
                          +{FINISH_TYPE_POINTS[type]}pt
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {FINISH_TYPE_DESCRIPTIONS[type]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !winnerId}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-xl transition-colors"
              >
                {loading ? "Salvando..." : "Salvar Placar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
