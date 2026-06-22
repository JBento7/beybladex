"use client";

import { useState } from "react";

export type RecordRow = {
  id: string;
  won: boolean;
  pointsScored: number;
  pointsConceded: number;
  opponentBeybladeId: string | null;
  opponentBeybladeeName: string | null;
  burstCount: number;
  koCount: number;
  spinFinishCount: number;
  overFinishCount: number;
  extremeFinishCount: number;
  createdAt: string;
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  isOfficial: boolean;
  isTest: boolean;
  opponentName: string;
};

const FINISH_LABELS = [
  { key: "burstCount", label: "Burst", color: "text-red-400" },
  { key: "koCount", label: "KO", color: "text-orange-400" },
  { key: "overFinishCount", label: "Over", color: "text-blue-400" },
  { key: "spinFinishCount", label: "Survivor", color: "text-green-400" },
  { key: "extremeFinishCount", label: "Extreme", color: "text-purple-400" },
] as const;

function FinishBar({ records }: { records: RecordRow[] }) {
  const totals = { burstCount: 0, koCount: 0, overFinishCount: 0, spinFinishCount: 0, extremeFinishCount: 0 };
  for (const r of records) {
    totals.burstCount += r.burstCount;
    totals.koCount += r.koCount;
    totals.overFinishCount += r.overFinishCount;
    totals.spinFinishCount += r.spinFinishCount;
    totals.extremeFinishCount += r.extremeFinishCount;
  }
  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  if (total === 0) return <p className="text-xs text-gray-600 text-center py-2">Sem dados de finish</p>;

  return (
    <div className="space-y-1.5">
      {FINISH_LABELS.map(({ key, label, color }) => {
        const count = totals[key];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={key} className="flex items-center gap-2">
            <span className={`text-[10px] font-bold w-14 flex-shrink-0 ${color}`}>{label}</span>
            <div className="flex-1 bg-[#252525] rounded-full h-2 overflow-hidden">
              <div className={`h-full rounded-full bg-current ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-400 w-10 text-right flex-shrink-0">{count} ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCards({ records }: { records: RecordRow[] }) {
  const wins = records.filter((r) => r.won).length;
  const losses = records.filter((r) => !r.won).length;
  const total = wins + losses;
  const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
  const scored = records.reduce((s, r) => s + r.pointsScored, 0);
  const conceded = records.reduce((s, r) => s + r.pointsConceded, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {[
        { label: "Vitórias", value: wins, color: "text-green-400" },
        { label: "Derrotas", value: losses, color: "text-red-400" },
        { label: "Taxa V.", value: `${wr}%`, color: "text-[#f0a500]" },
        { label: "Saldo pts", value: scored - conceded >= 0 ? `+${scored - conceded}` : `${scored - conceded}`, color: scored >= conceded ? "text-green-400" : "text-red-400" },
      ].map((s) => (
        <div key={s.label} className="bg-[#252525] rounded-xl p-3 text-center">
          <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function TournamentAccordion({ records }: { records: RecordRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  // Group by tournament
  const byTournament = new Map<string, { name: string; isOfficial: boolean; records: RecordRow[] }>();
  for (const r of records) {
    if (!byTournament.has(r.tournamentId)) {
      byTournament.set(r.tournamentId, { name: r.tournamentName, isOfficial: r.isOfficial, records: [] });
    }
    byTournament.get(r.tournamentId)!.records.push(r);
  }
  // Sort: most recent first (first record date)
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
        const tWins = t.records.filter((r) => r.won).length;
        const tLosses = t.records.filter((r) => !r.won).length;
        return (
          <div key={tId} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : tId)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[#1a1a1a] hover:bg-[#212121] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm text-white truncate">{t.name}</span>
                {t.isOfficial
                  ? <span className="text-[9px] font-bold bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded flex-shrink-0">OFICIAL</span>
                  : <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded flex-shrink-0">BEYENCONTRO</span>
                }
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-green-400 font-bold">{tWins}V</span>
                <span className="text-xs text-red-400 font-bold">{tLosses}D</span>
                <span className="text-gray-500 text-xs">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-0 divide-y divide-[#252525]">
                {t.records.map((r) => {
                  const finishParts: string[] = [];
                  if (r.burstCount) finishParts.push(`${r.burstCount}B`);
                  if (r.koCount) finishParts.push(`${r.koCount}KO`);
                  if (r.overFinishCount) finishParts.push(`${r.overFinishCount}O`);
                  if (r.spinFinishCount) finishParts.push(`${r.spinFinishCount}S`);
                  if (r.extremeFinishCount) finishParts.push(`${r.extremeFinishCount}X`);
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 bg-[#161616] flex-wrap">
                      <span className={`text-xs font-black w-5 flex-shrink-0 ${r.won ? "text-green-400" : "text-red-400"}`}>
                        {r.won ? "V" : "D"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white truncate">vs {r.opponentName}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {r.opponentBeybladeeName ?? "Desconhecido"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-xs font-bold ${r.won ? "text-green-400" : "text-red-400"}`}>
                          {r.pointsScored}×{r.pointsConceded}
                        </div>
                        {finishParts.length > 0 && (
                          <div className="text-[9px] text-gray-500">{finishParts.join(" ")}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BeybladeStatsClient({ records }: { records: RecordRow[] }) {
  type Tab = "all" | "official" | "beyencontro";
  const [tab, setTab] = useState<Tab>("all");

  const filtered = records.filter((r) => {
    if (tab === "official") return r.isOfficial;
    if (tab === "beyencontro") return !r.isOfficial;
    return true;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "Tudo" },
    { key: "official", label: "Torneios Oficiais" },
    { key: "beyencontro", label: "BeyEncontros" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-[#161616] p-1 rounded-xl mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
              tab === t.key
                ? "bg-[#f0a500] text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SummaryCards records={filtered} />

      {/* Finish type breakdown */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4 mb-5">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tipos de Finish</h3>
        <FinishBar records={filtered} />
      </div>

      {/* Per-tournament history */}
      <div>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Histórico por Torneio</h3>
        <TournamentAccordion records={filtered} />
      </div>
    </div>
  );
}
