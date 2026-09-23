"use client";

import { COMMUNITY_LIST as COMMUNITIES } from "@/lib/communities";

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
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logo} alt="" className="w-7 h-7 rounded-full object-cover" />
              <span className="font-black text-sm" style={{ color: community === c.slug ? c.color : "#fff" }}>{c.name}</span>
            </div>
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
