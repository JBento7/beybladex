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
  // Level 1: which tournament is open
  const [openTournament, setOpenTournament] = useState<string | null>(null);
  // Level 2: which opponent (within the open tournament) is expanded
  // key = tournamentId + ":" + opponentName
  const [openOpponent, setOpenOpponent] = useState<string | null>(null);

  // Group: tournament → opponent player → opponent beyblade → records
  type OppBeyStats = {
    beyName: string;
    records: RecordRow[];
  };
  type OpponentStats = {
    name: string;
    byBey: Map<string, OppBeyStats>;
    wins: number;
    losses: number;
  };
  type TournamentGroup = {
    name: string;
    isOfficial: boolean;
    wins: number;
    losses: number;
    opponents: Map<string, OpponentStats>;
  };

  const byTournament = new Map<string, TournamentGroup>();
  for (const r of records) {
    if (!byTournament.has(r.tournamentId)) {
      byTournament.set(r.tournamentId, {
        name: r.tournamentName,
        isOfficial: r.isOfficial,
        wins: 0, losses: 0,
        opponents: new Map(),
      });
    }
    const t = byTournament.get(r.tournamentId)!;
    if (r.won) t.wins++; else t.losses++;

    const oppKey = r.opponentName;
    if (!t.opponents.has(oppKey)) {
      t.opponents.set(oppKey, { name: r.opponentName, byBey: new Map(), wins: 0, losses: 0 });
    }
    const opp = t.opponents.get(oppKey)!;
    if (r.won) opp.wins++; else opp.losses++;

    const beyKey = r.opponentBeybladeeName ?? "Desconhecido";
    if (!opp.byBey.has(beyKey)) {
      opp.byBey.set(beyKey, { beyName: beyKey, records: [] });
    }
    opp.byBey.get(beyKey)!.records.push(r);
  }

  const tournamentEntries = [...byTournament.entries()].sort((a, b) => {
    const aDate = [...a[1].opponents.values()].flatMap((o) => [...o.byBey.values()]).flatMap((b) => b.records)[0]?.createdAt ?? "";
    const bDate = [...b[1].opponents.values()].flatMap((o) => [...o.byBey.values()]).flatMap((b) => b.records)[0]?.createdAt ?? "";
    return bDate.localeCompare(aDate);
  });

  if (tournamentEntries.length === 0) {
    return <p className="text-gray-600 text-sm text-center py-8">Nenhuma batalha registrada.</p>;
  }

  return (
    <div className="space-y-2">
      {tournamentEntries.map(([tId, t]) => {
        const tOpen = openTournament === tId;
        return (
          <div key={tId} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
            {/* Level 1 — Tournament header */}
            <button
              onClick={() => { setOpenTournament(tOpen ? null : tId); setOpenOpponent(null); }}
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
                <span className="text-xs text-green-400 font-bold">{t.wins}V</span>
                <span className="text-xs text-red-400 font-bold">{t.losses}D</span>
                <span className="text-gray-500 text-xs">{tOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {tOpen && (
              <div className="divide-y divide-[#252525]">
                {[...t.opponents.entries()].map(([oppKey, opp]) => {
                  const oppOpenKey = `${tId}:${oppKey}`;
                  const oppOpen = openOpponent === oppOpenKey;
                  return (
                    <div key={oppKey}>
                      {/* Level 2 — Opponent player row */}
                      <button
                        onClick={() => setOpenOpponent(oppOpen ? null : oppOpenKey)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-2.5 bg-[#161616] hover:bg-[#1d1d1d] transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#f0a500]/50 flex-shrink-0" />
                          <span className="text-sm text-gray-200 font-medium truncate">{opp.name}</span>
                          <span className="text-[10px] text-gray-600 flex-shrink-0">
                            {opp.byBey.size} beyblade{opp.byBey.size !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-green-400 font-bold">{opp.wins}V</span>
                          <span className="text-xs text-red-400 font-bold">{opp.losses}D</span>
                          <span className="text-gray-600 text-xs">{oppOpen ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {oppOpen && (
                        <div className="bg-[#111] px-5 py-3 space-y-3">
                          {[...opp.byBey.entries()].map(([beyKey, ob]) => {
                            const bWins = ob.records.filter((r) => r.won).length;
                            const bLosses = ob.records.filter((r) => !r.won).length;
                            const bScored = ob.records.reduce((s, r) => s + r.pointsScored, 0);
                            const bConceded = ob.records.reduce((s, r) => s + r.pointsConceded, 0);
                            const bTotal = bWins + bLosses;
                            const bWR = bTotal > 0 ? Math.round((bWins / bTotal) * 100) : 0;

                            // Aggregate finish types across all matches vs this opponent's bey
                            const ft = { burst: 0, ko: 0, over: 0, spin: 0, extreme: 0 };
                            for (const r of ob.records) {
                              ft.burst += r.burstCount;
                              ft.ko += r.koCount;
                              ft.over += r.overFinishCount;
                              ft.spin += r.spinFinishCount;
                              ft.extreme += r.extremeFinishCount;
                            }
                            const finishParts: string[] = [];
                            if (ft.burst) finishParts.push(`${ft.burst}B`);
                            if (ft.ko) finishParts.push(`${ft.ko}KO`);
                            if (ft.over) finishParts.push(`${ft.over}O`);
                            if (ft.spin) finishParts.push(`${ft.spin}S`);
                            if (ft.extreme) finishParts.push(`${ft.extreme}X`);

                            return (
                              /* Level 3 — Opponent beyblade card */
                              <div key={beyKey} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                                      <span className="text-xs font-bold text-white truncate">{ob.beyName}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-500">{bTotal} batalha{bTotal !== 1 ? "s" : ""}</span>
                                  </div>
                                  <div className={`text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                                    bWR >= 60 ? "bg-green-500/20 text-green-400"
                                    : bWR >= 40 ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-red-500/20 text-red-400"
                                  }`}>
                                    {bWR}% WR
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center mb-2">
                                  <div className="bg-[#252525] rounded-lg py-1.5">
                                    <div className="text-sm font-black text-green-400">{bWins}</div>
                                    <div className="text-[9px] text-gray-600">Vitórias</div>
                                  </div>
                                  <div className="bg-[#252525] rounded-lg py-1.5">
                                    <div className="text-sm font-black text-red-400">{bLosses}</div>
                                    <div className="text-[9px] text-gray-600">Derrotas</div>
                                  </div>
                                  <div className="bg-[#252525] rounded-lg py-1.5">
                                    <div className={`text-sm font-black ${bScored >= bConceded ? "text-green-400" : "text-red-400"}`}>
                                      {bScored - bConceded >= 0 ? "+" : ""}{bScored - bConceded}
                                    </div>
                                    <div className="text-[9px] text-gray-600">Saldo</div>
                                  </div>
                                </div>

                                {/* Points scored / conceded */}
                                <div className="flex items-center gap-2 text-[10px] mb-2">
                                  <span className="text-green-400">⚔️ {bScored} pts feitos</span>
                                  <span className="text-gray-700">·</span>
                                  <span className="text-red-400">🛡️ {bConceded} pts sofridos</span>
                                </div>

                                {/* Finish types */}
                                {finishParts.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ft.burst > 0 && <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-semibold">Burst ×{ft.burst}</span>}
                                    {ft.ko > 0 && <span className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-semibold">KO ×{ft.ko}</span>}
                                    {ft.over > 0 && <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold">Over ×{ft.over}</span>}
                                    {ft.spin > 0 && <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-semibold">Survivor ×{ft.spin}</span>}
                                    {ft.extreme > 0 && <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-semibold">Extreme ×{ft.extreme}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
