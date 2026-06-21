"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SimpleBey {
  id: string;
  name: string;
  beyLine: string | null;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  lockChip: string | null;
  metalBlade: string | null;
}

const LINE_LABELS: Record<string, string> = {
  BX: "BX", UX: "UX", CX: "CX",
  BX_EXPAND: "BX Expand", UX_EXPAND: "UX Expand", CX_EXPAND: "CX Expand",
};

function beyLabel(b: SimpleBey) {
  const isCX = b.beyLine === "CX" || b.beyLine === "CX_EXPAND";
  if (isCX) return [b.lockChip, b.metalBlade].filter(Boolean).join(" / ");
  return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
}

export default function MyDeckEditor({
  allBeyblades,
  currentIds,
  isFeatured,
}: {
  allBeyblades: SimpleBey[];
  currentIds: string[];
  isFeatured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentIds);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/profile/featured-deck", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bey1: selected[0] ?? null, bey2: selected[1] ?? null, bey3: selected[2] ?? null }),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao salvar deck.");
    }
  }

  async function clear() {
    setSaving(true);
    await fetch("/api/profile/featured-deck", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bey1: null, bey2: null, bey3: null }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setSelected(currentIds); setErr(null); setOpen(true); }}
          className="text-xs font-semibold text-[#f0a500] hover:text-[#d4940a] transition-colors border border-[#f0a500]/30 hover:border-[#f0a500]/60 px-2.5 py-1 rounded-lg"
        >
          {isFeatured ? "Editar Deck" : "Definir Deck Destaque"}
        </button>
        {isFeatured && (
          <button
            onClick={clear}
            disabled={saving}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="text-lg font-bold text-white">Deck Destaque</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="text-gray-400 hover:text-white text-2xl leading-none p-1 -m-1 flex-shrink-0">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Selecione até 3 combos para o seu deck destaque. ({selected.length}/3)
            </p>

            {err && (
              <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
                {err}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {allBeyblades.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Nenhum combo cadastrado.</p>
              ) : (
                allBeyblades.map((b) => {
                  const isSelected = selected.includes(b.id);
                  const slotIdx = selected.indexOf(b.id);
                  const slotColors = ["text-[#f0a500]", "text-[#c8102e]", "text-blue-400"];
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-[#f0a500] bg-[#f0a500]/10"
                          : "border-[#333] bg-[#252525] hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-black ${
                          isSelected ? "border-[#f0a500] bg-[#f0a500] text-black" : "border-gray-600"
                        }`}>
                          {isSelected ? slotIdx + 1 : ""}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm truncate ${isSelected ? "text-[#f0a500]" : "text-white"}`}>
                            {b.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {b.beyLine && (
                              <span className="text-[9px] font-bold bg-[#333] text-gray-400 px-1.5 py-0.5 rounded">
                                {LINE_LABELS[b.beyLine] ?? b.beyLine}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-500 truncate">{beyLabel(b)}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <span className={`text-xs font-black flex-shrink-0 ${slotColors[slotIdx] ?? "text-gray-400"}`}>
                            Bey {slotIdx + 1}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || selected.length === 0}
                className="flex-1 bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors"
              >
                {saving ? "Salvando..." : `Salvar (${selected.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
