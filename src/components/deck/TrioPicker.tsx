"use client";

import { useState } from "react";
import { checkTrio, PLUS_ONE_PARTS_RULE, type DeckBey } from "@/lib/deckFormat";

const parts = (b: DeckBey) => {
  const isCX = b.beyLine === "CX" || b.beyLine === "CX_EXPAND";
  return (isCX ? [b.lockChip, b.metalBlade, b.assistBlade, b.ratchet, b.bit] : [b.blade, b.ratchet, b.bit]).filter(Boolean).join(" / ");
};

// 3on3 + 1 reserva: pick the 3 active Beyblades of ONE match among the 4
// registered. The remaining one is shown as this match's reserve. Used by the
// player (own phone) and by the judge/organizer (recorded as staff action).
export default function TrioPicker({
  registered, initial, previous, official, color = "#f0a500", busy = false, confirmLabel = "Confirmar trio", onConfirm,
}: {
  registered: DeckBey[];
  initial?: string[] | null;
  previous?: string[] | null;
  official: boolean;
  color?: string;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(initial ?? []);
  const check = sel.length === 3 ? checkTrio(registered, sel, official) : null;
  const reserve = sel.length === 3 ? registered.find((b) => !sel.includes(b.id)) : null;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));
  const usablePrevious = previous && previous.length === 3 && previous.every((id) => registered.some((b) => b.id === id)) ? previous : null;

  if (registered.length !== 4) {
    return <p role="alert" className="text-sm text-amber-300">A inscrição não tem as 4 Beyblades exigidas — fale com a organização.</p>;
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold" aria-live="polite" style={{ color: sel.length === 3 ? "#22c55e" : color }}>Ativas: {sel.length} de 3</p>
        {usablePrevious && (
          <button type="button" onClick={() => setSel(usablePrevious)} className="text-sm underline text-gray-200 min-h-[44px] px-2">
            Usar o trio anterior
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Beyblades inscritas">
        {registered.map((b) => {
          const on = sel.includes(b.id);
          const blocked = !on && sel.length >= 3;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              disabled={blocked}
              onClick={() => toggle(b.id)}
              className={`text-left rounded-xl border-2 p-3 min-h-[56px] transition-all disabled:opacity-40 ${on ? "bg-field" : "bg-card border-line"}`}
              style={{ borderColor: on ? color : undefined }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-sm text-white break-words min-w-0">{b.name || "Beyblade"}</span>
                <span className="shrink-0 text-[11px] font-black" style={{ color: on ? color : "#777" }}>{on ? `ATIVA ${sel.indexOf(b.id) + 1}` : sel.length === 3 ? "RESERVA" : ""}</span>
              </div>
              {parts(b) && <div className="text-xs text-gray-400 mt-0.5 break-words">{parts(b)}</div>}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-gray-200">
        Reserva nesta partida: <strong className="text-white">{reserve ? reserve.name : "—"}</strong>
      </p>
      {official && <p className="mt-1 text-xs text-gray-400">{PLUS_ONE_PARTS_RULE}</p>}
      {check && !check.ok && <p role="alert" className="mt-2 text-sm text-red-300">{check.error}</p>}
      <button
        type="button"
        disabled={busy || !check || !check.ok}
        onClick={() => onConfirm(sel)}
        className="mt-3 w-full min-h-12 rounded-xl font-bold text-black disabled:opacity-50"
        style={{ background: color }}
      >
        {busy ? "Enviando…" : confirmLabel}
      </button>
    </div>
  );
}
