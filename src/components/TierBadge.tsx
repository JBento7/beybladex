import { tierFor } from "@/lib/tiers";

// Small tier chip derived from a blader's career official wins.
export function TierBadge({ wins, size = "sm" }: { wins: number; size?: "sm" | "md" }) {
  const { tier } = tierFor(wins);
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-black ${pad}`}
      style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}55` }}
      title={`Tier ${tier.name} · ${wins} vitórias oficiais`}
    >
      {tier.icon} {tier.name}
    </span>
  );
}
