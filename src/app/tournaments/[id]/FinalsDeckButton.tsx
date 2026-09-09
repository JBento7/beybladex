"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Beyblade { id: string; name: string; blade: string | null; ratchet: string | null; bit: string | null }

// Suíço finals: let a qualified player change exactly ONE combo of their deck,
// once, for the knockout matches.
export default function FinalsDeckButton({ tournamentId, currentDeckIds }: { tournamentId: string; currentDeckIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [beyblades, setBeyblades] = useState<Beyblade[]>([]);
  const [selected, setSelected] = useState<string[]>(currentDeckIds);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setSelected(currentDeckIds);
    setErr(null);
    fetch("/api/beyblades").then((r) => (r.ok ? r.json() : [])).then((d) => setBeyblades(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open, currentDeckIds]);

  // How many chosen combos differ from the original deck.
  const changed = selected.filter((id) => !currentDeckIds.includes(id)).length;
  const valid = selected.length === 3 && new Set(selected).size === 3 && changed <= 1;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // must remove one first
      return [...prev, id];
    });
  }

  async function save() {
    if (!valid) return;
    setLoading(true);
    setErr(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/finals-deck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beybladeIds: selected }),
    });
    setLoading(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); setErr(d.error || "Erro ao salvar"); }
  }

  const comboParts = (b: Beyblade) => [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-4 py-2 rounded-lg transition-colors"
      >
        🔧 Trocar 1 combo (finais)
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold text-white mb-1">Deck das Finais</h2>
            <p className="text-sm text-gray-400 mb-3">Você pode alterar <b className="text-[#f0a500]">apenas 1 combo</b> do seu deck para o mata-mata. Escolha 3.</p>

            {err && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>}

            <div className="flex-1 overflow-y-auto space-y-2 mb-3">
              {beyblades.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Carregando combos...</p>
              ) : beyblades.map((b) => {
                const isSel = selected.includes(b.id);
                const isOriginal = currentDeckIds.includes(b.id);
                return (
                  <button key={b.id} onClick={() => toggle(b.id)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${isSel ? "border-[#f0a500] bg-[#f0a500]/10" : "border-[#333] bg-[#252525] hover:border-gray-600"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isSel ? "border-[#f0a500] bg-[#f0a500]" : "border-gray-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm truncate ${isSel ? "text-[#f0a500]" : "text-white"}`}>{b.name}</div>
                        {comboParts(b) && <div className="text-xs text-gray-500 truncate">{comboParts(b)}</div>}
                      </div>
                      {isOriginal && <span className="text-[10px] text-gray-500 flex-shrink-0">do deck</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {changed > 1 && <div className="mb-2 text-xs text-yellow-400">⚠️ Você alterou mais de 1 combo — só é permitido trocar um.</div>}

            <div className="flex gap-3">
              <button onClick={() => setOpen(false)} className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={loading || !valid} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors">
                {loading ? "Salvando..." : `Salvar (${selected.length}/3)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
