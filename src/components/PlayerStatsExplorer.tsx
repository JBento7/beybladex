"use client";

import { useMemo, useState } from "react";
import type { PlayerRecordRow } from "@/lib/beyblade-stats";

const FINISH_LABELS = [
  { key: "burstCount", label: "Burst", color: "text-red-400" },
  { key: "koCount", label: "KO", color: "text-orange-400" },
  { key: "overFinishCount", label: "Over", color: "text-blue-400" },
  { key: "spinFinishCount", label: "Survivor", color: "text-green-400" },
  { key: "extremeFinishCount", label: "Extreme", color: "text-purple-400" },
] as const;

type FinishKey = (typeof FINISH_LABELS)[number]["key"];

function recordStats(records: PlayerRecordRow[]) {
  const wins = records.filter((r) => r.won).length;
  const losses = records.length - wins;
  const total = records.length;
  const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
  const scored = records.reduce((s, r) => s + r.pointsScored, 0);
  const conceded = records.reduce((s, r) => s + r.pointsConceded, 0);
  return { wins, losses, total, wr, scored, conceded };
}

function WinLossPill({ records }: { records: PlayerRecordRow[] }) {
  const { wins, losses } = recordStats(records);
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <span className="text-xs text-green-400 font-bold">{wins}V</span>
      <span className="text-xs text-red-400 font-bold">{losses}D</span>
    </div>
  );
}

function FinishChips({ records }: { records: PlayerRecordRow[] }) {
  const totals = FINISH_LABELS.reduce((acc, f) => {
    acc[f.key] = records.reduce((s, r) => s + r[f.key], 0);
    return acc;
  }, {} as Record<FinishKey, number>);
  const any = Object.values(totals).some((v) => v > 0);
  if (!any) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {FINISH_LABELS.map(({ key, label, color }) =>
        totals[key] > 0 ? (
          <span key={key} className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] ${color}`}>
            {label} ×{totals[key]}
          </span>
        ) : null
      )}
    </div>
  );
}

/** Battle list for a single beyblade vs a single opponent. */
function BattleList({ records }: { records: PlayerRecordRow[] }) {
  return (
    <div className="divide-y divide-[#252525]">
      {records.map((r) => {
        const finishParts: string[] = [];
        if (r.burstCount) finishParts.push(`${r.burstCount}B`);
        if (r.koCount) finishParts.push(`${r.koCount}KO`);
        if (r.overFinishCount) finishParts.push(`${r.overFinishCount}O`);
        if (r.spinFinishCount) finishParts.push(`${r.spinFinishCount}S`);
        if (r.extremeFinishCount) finishParts.push(`${r.extremeFinishCount}X`);
        return (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2 bg-[#141414] flex-wrap">
            <span className={`text-xs font-black w-5 flex-shrink-0 ${r.won ? "text-green-400" : "text-red-400"}`}>
              {r.won ? "V" : "D"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-gray-500 truncate">vs {r.opponentBeybladeName}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-xs font-bold ${r.won ? "text-green-400" : "text-red-400"}`}>
                {r.pointsScored}×{r.pointsConceded}
              </div>
              {finishParts.length > 0 && <div className="text-[9px] text-gray-500">{finishParts.join(" ")}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Beyblade-level grouping inside one opponent. */
function BeybladeGroup({ records }: { records: PlayerRecordRow[] }) {
  const byBeyblade = new Map<string, { name: string; records: PlayerRecordRow[] }>();
  for (const r of records) {
    if (!byBeyblade.has(r.beybladeId)) byBeyblade.set(r.beybladeId, { name: r.beybladeName, records: [] });
    byBeyblade.get(r.beybladeId)!.records.push(r);
  }
  const entries = [...byBeyblade.entries()].sort((a, b) => b[1].records.length - a[1].records.length);

  return (
    <div className="space-y-2 p-3">
      {entries.map(([beyId, b]) => {
        const { wins, losses, wr } = recordStats(b.records);
        return (
          <div key={beyId} className="rounded-lg bg-[#181818] border border-[#262626] overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm font-semibold text-white truncate">{b.name}</span>
              <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                <span className="text-green-400 font-bold">{wins}V</span>
                <span className="text-red-400 font-bold">{losses}D</span>
                <span className="text-[#f0a500] font-bold">{wr}%</span>
              </div>
            </div>
            <FinishChips records={b.records} />
            <BattleList records={b.records} />
          </div>
        );
      })}
    </div>
  );
}

/** Opponent-level grouping inside one tournament. */
function OpponentGroup({ records }: { records: PlayerRecordRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const byOpponent = new Map<string, { name: string; records: PlayerRecordRow[] }>();
  for (const r of records) {
    if (!byOpponent.has(r.opponentId)) byOpponent.set(r.opponentId, { name: r.opponentName, records: [] });
    byOpponent.get(r.opponentId)!.records.push(r);
  }
  const entries = [...byOpponent.entries()].sort((a, b) => b[1].records.length - a[1].records.length);

  return (
    <div className="bg-[#101010] p-2 space-y-1.5">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 pt-1">Jogadores</div>
      {entries.map(([oppId, o]) => {
        const isOpen = open === oppId;
        return (
          <div key={oppId} className="rounded-lg border border-[#262626] overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : oppId)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-[#1c1c1c] hover:bg-[#222] transition-colors text-left"
            >
              <span className="text-sm font-medium text-white truncate">{o.name}</span>
              <div className="flex items-center gap-3 flex-shrink-0">
                <WinLossPill records={o.records} />
                <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {isOpen && <BeybladeGroup records={o.records} />}
          </div>
        );
      })}
    </div>
  );
}

/** Tournament-level accordion. */
function TournamentGroup({ records }: { records: PlayerRecordRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const byTournament = new Map<string, { name: string; isOfficial: boolean; records: PlayerRecordRow[] }>();
  for (const r of records) {
    if (!byTournament.has(r.tournamentId)) {
      byTournament.set(r.tournamentId, { name: r.tournamentName, isOfficial: r.isOfficial, records: [] });
    }
    byTournament.get(r.tournamentId)!.records.push(r);
  }
  const entries = [...byTournament.entries()].sort((a, b) => {
    const aDate = a[1].records[0]?.createdAt ?? "";
    const bDate = b[1].records[0]?.createdAt ?? "";
    return bDate.localeCompare(aDate);
  });

  if (entries.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-8">Nenhuma batalha registrada.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([tId, t]) => {
        const isOpen = open === tId;
        const { wins, losses } = recordStats(t.records);
        return (
          <div key={tId} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : tId)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#1a1a1a] hover:bg-[#212121] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm text-white truncate">{t.name}</span>
                {t.isOfficial ? (
                  <span className="text-[9px] font-bold bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded flex-shrink-0">OFICIAL</span>
                ) : (
                  <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded flex-shrink-0">BEYENCONTRO</span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-green-400 font-bold">{wins}V</span>
                <span className="text-xs text-red-400 font-bold">{losses}D</span>
                <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>
            {isOpen && <OpponentGroup records={t.records} />}
          </div>
        );
      })}
    </div>
  );
}

export default function PlayerStatsExplorer({ records }: { records: PlayerRecordRow[] }) {
  type Tab = "official" | "beyencontro";
  const [tab, setTab] = useState<Tab>("official");

  const filtered = useMemo(
    () => records.filter((r) => (tab === "official" ? r.isOfficial : !r.isOfficial)),
    [records, tab]
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "official", label: "Torneios" },
    { key: "beyencontro", label: "BeyEncontros" },
  ];

  if (records.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-8">Nenhuma batalha registrada ainda.</p>;
  }

  return (
    <div>
      {/* Top tab bar: torneio vs beyencontro */}
      <div className="flex gap-1 bg-[#161616] p-1 rounded-xl mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              tab === t.key ? "bg-[#f0a500] text-black" : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <TournamentGroup records={filtered} />
    </div>
  );
}
