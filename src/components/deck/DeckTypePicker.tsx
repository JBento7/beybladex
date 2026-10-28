"use client";

import { DECK_DESCRIPTION, DECK_LABEL_FULL, PLUS_ONE_ORGANIZER_NOTE, PLUS_ONE_PARTS_RULE, type DeckTypeValue } from "@/lib/deckFormat";

const OPTIONS: { value: DeckTypeValue; icon: string | null }[] = [
  { value: "SOLO", icon: null },
  { value: "THREE_ON_THREE", icon: "⚡" },
  { value: "THREE_ON_THREE_PLUS_ONE", icon: "🔁" },
];

// Deck format picker for tournament creation/edition. The deck format is
// independent of the bracket format (Suíço / Grupos / Mata-mata).
export default function DeckTypePicker({ value, onChange, registrations = 0 }: { value: string; onChange: (v: DeckTypeValue) => void; registrations?: number }) {
  return (
    <div className="bg-card border border-line rounded-xl p-6">
      <h2 className="text-base font-bold text-white mb-4">Tipo de Deck <span className="text-red-400">*</span></h2>
      <div role="radiogroup" aria-label="Tipo de deck" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((d) => {
          const active = value === d.value;
          return (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(d.value)}
              className={`text-left p-4 min-h-[44px] rounded-xl border transition-all ${active ? "border-brand-red bg-brand-red/10" : "border-line bg-field hover:border-gray-600"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {d.icon ? <span className="text-xl" aria-hidden="true">{d.icon}</span> : <img src="/brand/bey-96.webp" alt="" className="w-5 h-5 object-contain" />}
                <span className={`font-semibold text-sm ${active ? "text-danger" : "text-white"}`}>{DECK_LABEL_FULL[d.value]}</span>
              </div>
              <div className="text-xs text-gray-400">{DECK_DESCRIPTION[d.value]}</div>
            </button>
          );
        })}
      </div>
      {value === "THREE_ON_THREE_PLUS_ONE" && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-1.5">
          <p>{PLUS_ONE_ORGANIZER_NOTE}</p>
          <p className="text-amber-200/90">{PLUS_ONE_PARTS_RULE}</p>
        </div>
      )}
      {registrations > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          Este torneio já tem {registrations} inscrição(ões). Mudar o tipo de deck só é possível se todas tiverem o número de Beyblades do novo formato — as inscrições não são convertidas automaticamente.
        </p>
      )}
    </div>
  );
}
