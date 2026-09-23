"use client";

// Communities using the app. Kept in sync with the rows seeded by /api/migrate.
export const COMMUNITIES = [
  { slug: "lbl", name: "LBL", city: "Londrina" },
  { slug: "lbm", name: "LBM", city: "Maringá" },
] as const;

// Which community hosts the event and whether it is a partnership. A partnership
// counts ONLY in the shared LBL+LBM ranking; otherwise the event counts in the
// host community's own ranking.
export default function CommunityPicker({
  community,
  partnership,
  onChange,
}: {
  community: string;
  partnership: boolean;
  onChange: (v: { community: string; partnership: boolean }) => void;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <h2 className="text-base font-bold text-white mb-1">Comunidade</h2>
      <p className="text-xs text-gray-500 mb-4">Define em qual ranking o torneio conta.</p>

      <div className="grid grid-cols-2 gap-3">
        {COMMUNITIES.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onChange({ community: c.slug, partnership })}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              community === c.slug ? "border-[#f0a500] bg-[#f0a500]/10" : "border-[#333] bg-[#252525] hover:border-gray-600"
            }`}
          >
            <div className={`font-black text-sm ${community === c.slug ? "text-[#f0a500]" : "text-white"}`}>{c.name}</div>
            <div className="text-xs text-gray-400">{c.city} · organiza o evento</div>
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-3 cursor-pointer">
        <input
          id="isPartnership"
          type="checkbox"
          checked={partnership}
          onChange={(e) => onChange({ community, partnership: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-[#f0a500]"
        />
        <span className="text-sm">
          <span className="font-bold text-white">Torneio em parceria LBL + LBM</span>
          <span className="block text-xs text-gray-400">
            {partnership
              ? "Conta SOMENTE no ranking compartilhado — não pontua nos rankings LBL e LBM."
              : `Conta no ranking da ${COMMUNITIES.find((c) => c.slug === community)?.name ?? community}.`}
          </span>
        </span>
      </label>
    </div>
  );
}
