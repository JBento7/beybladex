"use client";

import { useState } from "react";

// Admin-only: play the launch/rules video on a chosen arena's telão.
export default function LaunchVideoButton({ arenas }: { arenas: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const count = Math.max(1, arenas);

  async function run(arena: number) {
    setBusy(arena);
    setErr(null);
    try {
      const res = await fetch("/api/admin/arena-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arena }),
      });
      if (res.ok) { setSent(arena); setTimeout(() => setSent(null), 2500); }
      else { const d = await res.json().catch(() => ({})); setErr(d.error || "Erro"); }
    } catch { setErr("Erro de conexão"); }
    setBusy(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-[#1a1a1a] hover:bg-[#252525] border border-[#f0a500]/40 text-[#f0a500] font-bold px-4 py-2 rounded-lg transition-colors"
      >
        🎬 Vídeo Lançamento
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-white mb-1">Vídeo de Lançamento</h2>
            <p className="text-sm text-gray-400 mb-4">Escolha a arena onde o vídeo de regras vai tocar (no telão dela).</p>
            {err && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>}
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: count }, (_, i) => i + 1).map((a) => (
                <button
                  key={a}
                  onClick={() => run(a)}
                  disabled={busy !== null}
                  className={`py-3 rounded-xl font-bold border transition-colors disabled:opacity-50 ${sent === a ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-[#252525] hover:bg-[#2d2d2d] text-white border-[#333]"}`}
                >
                  {busy === a ? "..." : sent === a ? "✓ Enviado" : `Arena ${a}`}
                </button>
              ))}
            </div>
            <button onClick={() => setOpen(false)} className="mt-4 w-full bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors">Fechar</button>
          </div>
        </div>
      )}
    </>
  );
}
