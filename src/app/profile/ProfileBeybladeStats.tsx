"use client";

import { useState } from "react";
import Link from "next/link";
import type { RecordRow } from "@/app/beyblade/[id]/BeybladeStatsClient";

const LINE_LABELS: Record<string, string> = {
  BX: "BX", UX: "UX", CX: "CX",
  BX_EXPAND: "BX Expand", UX_EXPAND: "UX Expand", CX_EXPAND: "CX Expand",
};

const FINISH_LABELS = [
  { key: "burstCount" as const,       label: "Burst",    color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
  { key: "koCount" as const,          label: "KO",       color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  { key: "overFinishCount" as const,  label: "Over",     color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  { key: "spinFinishCount" as const,  label: "Survivor", color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  { key: "extremeFinishCount" as const, label: "Extreme", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
];

export type BeybladeWithRecords = {
  id: string;
  name: string;
  beyLine: string | null;
  parts: string;
  wins: number;
  losses: number;
  records: RecordRow[];
};

// ── Finish type bar ────────────────────────────────────────────────────────────
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
            <span className="text-[10px] text-gray-500 w-12 text-right flex-shrink-0">{count} ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Tournament → Player → Beyblade drill-down ──────────────────────────────────
function DrillDown({ records }: { records: RecordRow[] }) {
  const [openT, setOpenT] = useState<string | null>(null);
  const [openOpp, setOpenOpp] = useState<string | null>(null);

  type OppBey = { beyName: string; records: RecordRow[] };
  type Opp = { name: string; wins: number; losses: number; byBey: Map<string, OppBey> };
  type Tourney = { name: string; isOfficial: boolean; wins: number; losses: number; opponents: Map<string, Opp> };

  const byT = new Map<string, Tourney>();
  for (const r of records) {
    if (!byT.has(r.tournamentId)) byT.set(r.tournamentId, { name: r.tournamentName, isOfficial: r.isOfficial, wins: 0, losses: 0, opponents: new Map() });
    const t = byT.get(r.tournamentId)!;
    r.won ? t.wins++ : t.losses++;
    if (!t.opponents.has(r.opponentName)) t.opponents.set(r.opponentName, { name: r.opponentName, wins: 0, losses: 0, byBey: new Map() });
    const opp = t.opponents.get(r.opponentName)!;
    r.won ? opp.wins++ : opp.losses++;
    const bk = r.opponentBeybladeeName ?? "Desconhecido";
    if (!opp.byBey.has(bk)) opp.byBey.set(bk, { beyName: bk, records: [] });
    opp.byBey.get(bk)!.records.push(r);
  }

  const tEntries = [...byT.entries()].sort((a, b) => {
    const aD = [...a[1].opponents.values()].flatMap(o => [...o.byBey.values()]).flatMap(b => b.records)[0]?.createdAt ?? "";
    const bD = [...b[1].opponents.values()].flatMap(o => [...o.byBey.values()]).flatMap(b => b.records)[0]?.createdAt ?? "";
    return bD.localeCompare(aD);
  });

  if (tEntries.length === 0) return <p className="text-gray-600 text-xs text-center py-4">Nenhuma batalha registrada.</p>;

  return (
    <div className="space-y-1.5">
      {tEntries.map(([tId, t]) => {
        const tOpen = openT === tId;
        return (
          <div key={tId} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
            {/* Level 1 — Tournament */}
            <button
              onClick={() => { setOpenT(tOpen ? null : tId); setOpenOpp(null); }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-[#1e1e1e] hover:bg-[#242424] transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-white truncate">{t.name}</span>
                {t.isOfficial
                  ? <span className="text-[9px] font-bold bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded flex-shrink-0">OFICIAL</span>
                  : <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded flex-shrink-0">BEYENCONTRO</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-green-400 font-bold">{t.wins}V</span>
                <span className="text-xs text-red-400 font-bold">{t.losses}D</span>
                <span className="text-gray-600 text-xs">{tOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {tOpen && (
              <div className="divide-y divide-[#252525]">
                {[...t.opponents.entries()].map(([oppKey, opp]) => {
                  const oppId = `${tId}:${oppKey}`;
                  const oppOpen = openOpp === oppId;
                  return (
                    <div key={oppKey}>
                      {/* Level 2 — Opponent */}
                      <button
                        onClick={() => setOpenOpp(oppOpen ? null : oppId)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-2 bg-[#161616] hover:bg-[#1c1c1c] transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#f0a500]/40 flex-shrink-0" />
                          <span className="text-sm text-gray-200 font-medium truncate">{opp.name}</span>
                          <span className="text-[10px] text-gray-600 flex-shrink-0">{opp.byBey.size} bey{opp.byBey.size !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-green-400 font-bold">{opp.wins}V</span>
                          <span className="text-xs text-red-400 font-bold">{opp.losses}D</span>
                          <span className="text-gray-600 text-xs">{oppOpen ? "▲" : "▼"}</span>
                        </div>
                      </button>

                      {oppOpen && (
                        <div className="bg-[#111] px-4 py-3 space-y-2.5">
                          {[...opp.byBey.entries()].map(([bk, ob]) => {
                            const bW = ob.records.filter(r => r.won).length;
                            const bL = ob.records.filter(r => !r.won).length;
                            const bS = ob.records.reduce((s, r) => s + r.pointsScored, 0);
                            const bC = ob.records.reduce((s, r) => s + r.pointsConceded, 0);
                            const bWR = (bW + bL) > 0 ? Math.round((bW / (bW + bL)) * 100) : 0;
                            const ft = { burst: 0, ko: 0, over: 0, spin: 0, extreme: 0 };
                            for (const r of ob.records) {
                              ft.burst += r.burstCount; ft.ko += r.koCount;
                              ft.over += r.overFinishCount; ft.spin += r.spinFinishCount; ft.extreme += r.extremeFinishCount;
                            }
                            return (
                              /* Level 3 — Opponent beyblade */
                              <div key={bk} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <img src="/bey-removebg-preview.png" alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
                                      <span className="text-xs font-bold text-white truncate">{ob.beyName}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-600">{bW + bL} batalha{(bW + bL) !== 1 ? "s" : ""}</span>
                                  </div>
                                  <span className={`text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0 ${
                                    bWR >= 60 ? "bg-green-500/20 text-green-400" : bWR >= 40 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"
                                  }`}>{bWR}% WR</span>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
                                  {[["text-green-400", bW, "V"], ["text-red-400", bL, "D"], [bS >= bC ? "text-green-400" : "text-red-400", `${bS - bC >= 0 ? "+" : ""}${bS - bC}`, "Saldo"]].map(([c, v, l]) => (
                                    <div key={String(l)} className="bg-[#252525] rounded-lg py-1.5">
                                      <div className={`text-sm font-black ${c}`}>{v}</div>
                                      <div className="text-[9px] text-gray-600">{l}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] mb-2">
                                  <span className="text-green-400">⚔️ {bS} feitos</span>
                                  <span className="text-gray-700">·</span>
                                  <span className="text-red-400">🛡️ {bC} sofridos</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {ft.burst > 0 && <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-semibold">Burst ×{ft.burst}</span>}
                                  {ft.ko > 0 && <span className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-semibold">KO ×{ft.ko}</span>}
                                  {ft.over > 0 && <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold">Over ×{ft.over}</span>}
                                  {ft.spin > 0 && <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-semibold">Survivor ×{ft.spin}</span>}
                                  {ft.extreme > 0 && <span className="text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-semibold">Extreme ×{ft.extreme}</span>}
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProfileBeybladeStats({ beyblades }: { beyblades: BeybladeWithRecords[] }) {
  const [openBey, setOpenBey] = useState<string | null>(null);

  if (beyblades.length === 0) return null;

  return (
    <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-4">Estatísticas por Combo</h2>
      <div className="space-y-2">
        {beyblades.map((b) => {
          const isOpen = openBey === b.id;
          const total = b.wins + b.losses;
          const wr = total > 0 ? Math.round((b.wins / total) * 100) : 0;
          const scored = b.records.reduce((s, r) => s + r.pointsScored, 0);
          const conceded = b.records.reduce((s, r) => s + r.pointsConceded, 0);

          return (
            <div key={b.id} className="border border-[#2a2a2a] rounded-xl overflow-hidden">
              {/* Beyblade header row */}
              <button
                onClick={() => setOpenBey(isOpen ? null : b.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#252525] hover:bg-[#2d2d2d] transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-[#f0a500]/10 border border-[#f0a500]/20 flex items-center justify-center flex-shrink-0">
                  <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-white truncate">{b.name}</span>
                    {b.beyLine && (
                      <span className="text-[9px] font-bold bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded flex-shrink-0">
                        {LINE_LABELS[b.beyLine] ?? b.beyLine}
                      </span>
                    )}
                  </div>
                  {b.parts && <div className="text-[10px] text-gray-500 truncate">{b.parts}</div>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                  <span className="text-green-400 font-bold">{b.wins}V</span>
                  <span className="text-red-400 font-bold">{b.losses}D</span>
                  <span className={`font-black ${wr >= 50 ? "text-[#f0a500]" : "text-gray-500"}`}>{wr}%</span>
                  <span className="text-gray-600">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="bg-[#1a1a1a] p-4 space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Vitórias", value: b.wins, color: "text-green-400" },
                      { label: "Derrotas", value: b.losses, color: "text-red-400" },
                      { label: "Taxa V.", value: `${wr}%`, color: "text-[#f0a500]" },
                      { label: "Saldo pts", value: `${scored - conceded >= 0 ? "+" : ""}${scored - conceded}`, color: scored >= conceded ? "text-green-400" : "text-red-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-[#252525] rounded-xl p-2.5 text-center">
                        <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Finish type breakdown */}
                  {b.records.length > 0 && (
                    <div className="bg-[#252525] rounded-xl p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Tipos de Finish</div>
                      <FinishBar records={b.records} />
                    </div>
                  )}

                  {/* Drill-down: Torneio → Jogador → Beyblade */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Histórico por Torneio</div>
                    <DrillDown records={b.records} />
                  </div>

                  {/* Link to full stats page */}
                  <div className="pt-1 text-center">
                    <Link href={`/beyblade/${b.id}`} className="text-xs text-[#f0a500] hover:underline">
                      Ver página completa de estatísticas →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
