// "Pontuação dobrada": the form option and the label shown wherever the event
// appears (card, details, registration, results). The label always carries
// text ("×2 · Pontuação dobrada"), never only a color.

export const DOUBLE_POINTS_LABEL = "Pontuação dobrada";
export const DOUBLE_POINTS_DESC = "Este torneio concede o dobro dos pontos de ranking.";

/** Checkbox for create/edit — only rendered for official events by admins. */
export function DoubleRankingOption({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 mt-4 bg-brand-yellow/10 border border-brand-yellow/40 rounded-xl p-4 cursor-pointer">
      <input
        type="checkbox"
        name="doubleRankingPoints"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby="double-points-desc"
        className="accent-brand-yellow mt-0.5"
      />
      <div>
        <p className="font-bold text-brand-yellow text-sm">
          <span aria-hidden="true">×2 </span>{DOUBLE_POINTS_LABEL}
        </p>
        <p id="double-points-desc" className="text-xs text-gray-400 mt-0.5">{DOUBLE_POINTS_DESC}</p>
      </div>
    </label>
  );
}

/** Small label: "×2 Pontuação dobrada". */
export function DoubleRankingBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-brand-yellow/60 bg-brand-yellow/10 px-2 py-0.5 text-[11px] font-bold text-brand-yellow whitespace-nowrap ${className}`}
      title={DOUBLE_POINTS_DESC}
    >
      <span aria-hidden="true">×2</span>
      {DOUBLE_POINTS_LABEL}
    </span>
  );
}
