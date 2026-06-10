"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Player = { id: string; name: string; bladerName?: string | null };

export default function WOButton({
  matchId,
  player1,
  player2,
}: {
  matchId: string;
  player1: Player;
  player2: Player;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function declareWalkover(winnerId: string) {
    setErr(null);
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/wo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId }),
    });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Erro ao registrar W.O.");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        W.O.
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !loading && setOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Declarar W.O.</h3>
            <p className="text-sm text-gray-400 mb-4">
              Selecione o jogador <strong>ausente</strong>. A vitória será dada automaticamente ao adversário, sem disputa de sets.
            </p>

            {err && (
              <div className="mb-4 text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                {err}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => declareWalkover(player2.id)}
                disabled={loading}
                className="p-3 rounded-xl border-2 border-[#333] hover:border-[#c8102e] bg-[#252525] text-left transition-all disabled:opacity-50"
              >
                <div className="text-sm font-bold text-white">{player1.bladerName || player1.name} ausente</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Vitória por W.O. para {player2.bladerName || player2.name}
                </div>
              </button>
              <button
                onClick={() => declareWalkover(player1.id)}
                disabled={loading}
                className="p-3 rounded-xl border-2 border-[#333] hover:border-[#c8102e] bg-[#252525] text-left transition-all disabled:opacity-50"
              >
                <div className="text-sm font-bold text-white">{player2.bladerName || player2.name} ausente</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Vitória por W.O. para {player1.bladerName || player1.name}
                </div>
              </button>
            </div>

            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="w-full mt-4 bg-[#252525] hover:bg-[#333] disabled:opacity-50 text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
