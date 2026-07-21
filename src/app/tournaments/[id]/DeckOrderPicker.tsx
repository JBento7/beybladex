"use client";

import { useState } from "react";

export type BeybladeInfo = {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
};

export function comboParts(b: BeybladeInfo) {
  return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
}

// Tap-to-order picker: player taps their beyblades in the desired sequence,
// then confirms. Reused by the judge modal and the player's own phone.
export default function DeckOrderPicker({
  title,
  beyblades,
  color,
  confirmLabel = "Confirmar Ordem",
  onConfirm,
  busy = false,
}: {
  title: string;
  beyblades: BeybladeInfo[];
  color: string;
  confirmLabel?: string;
  onConfirm: (order: string[]) => void;
  busy?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const beyMap = Object.fromEntries(beyblades.map((b) => [b.id, b]));
  const complete = selected.length === beyblades.length;

  function tap(id: string) {
    if (selected.includes(id)) setSelected(selected.filter((s) => s !== id));
    else setSelected([...selected, id]);
  }

  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold" style={{ color }}>
          {title}
        </div>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} className="text-[10px] text-gray-500 hover:text-white underline">
            limpar
          </button>
        )}
      </div>

      {/* Slots: chosen order */}
      <div className="flex gap-2 mb-3">
        {[0, 1, 2].map((i) => {
          const id = selected[i];
          const b = id ? beyMap[id] : null;
          return (
            <button
              key={i}
              type="button"
              onClick={() => id && setSelected(selected.filter((s) => s !== id))}
              className={`flex-1 rounded-xl border-2 py-2.5 px-1 text-center transition-all ${
                b ? "bg-[#252525]" : "border-dashed border-[#333] bg-transparent"
              }`}
              style={{ borderColor: b ? color : undefined }}
            >
              <div className="text-[10px] font-black mb-0.5" style={{ color: b ? color : "#555" }}>
                {i + 1}°
              </div>
              <div className={`text-[11px] font-bold leading-tight ${b ? "text-white" : "text-[#444]"}`}>
                {b ? b.name : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Available beyblades */}
      {!complete && (
        <div className="space-y-2 mb-3">
          {beyblades.map((b) => {
            const idx = selected.indexOf(b.id);
            const isChosen = idx !== -1;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => tap(b.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all active:scale-[0.98] ${
                  isChosen ? "opacity-30 border-[#333] bg-[#1a1a1a]" : "border-[#333] bg-[#252525] hover:border-[#555]"
                }`}
              >
                <span className="text-sm font-black w-6 text-center flex-shrink-0" style={{ color: isChosen ? "#555" : color }}>
                  {isChosen ? `${idx + 1}°` : "·"}
                </span>
                <span className="text-sm font-bold text-white">{b.name}</span>
                {comboParts(b) && (
                  <span className="text-xs text-gray-500 font-normal ml-auto truncate">{comboParts(b)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => complete && !busy && onConfirm(selected)}
        disabled={!complete || busy}
        className="w-full text-sm font-black py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white active:scale-[0.98]"
        style={{ backgroundColor: complete && !busy ? color : "#333" }}
      >
        {busy ? "Enviando..." : complete ? confirmLabel : `Toque nas beyblades (${selected.length}/3)`}
      </button>
    </div>
  );
}
