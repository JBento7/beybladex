import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { getComboStats } from "@/lib/beyblade-stats";
import { FINISH_TYPE_LABELS } from "@/lib/scoring";
import type { FinishType } from "@prisma/client";

export const dynamic = "force-dynamic";

const finishOrder: FinishType[] = ["EXTREME_FINISH", "BURST_FINISH", "OVER_FINISH", "SPIN_FINISH"];
const finishColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500] text-black",
  BURST_FINISH: "bg-purple-500 text-white",
  OVER_FINISH: "bg-blue-500 text-white",
  SPIN_FINISH: "bg-gray-500 text-white",
};
const finishBarColors: Record<string, string> = {
  EXTREME_FINISH: "bg-[#f0a500]",
  BURST_FINISH: "bg-purple-500",
  OVER_FINISH: "bg-blue-500",
  SPIN_FINISH: "bg-gray-500",
};

// Simple SVG donut for win/loss ratio
function WinLossDonut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const winFrac = total > 0 ? wins / total : 0;
  const winLen = circ * winFrac;
  return (
    <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#3a1a1f" strokeWidth="12" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#c8102e" strokeWidth="12"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset="0" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#22c55e" strokeWidth="12"
        strokeDasharray={`${winLen} ${circ}`} strokeDashoffset="0" strokeLinecap="butt" />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
        className="rotate-90" fill="#fff" fontSize="20" fontWeight="bold"
        transform="rotate(90 50 50)">
        {total > 0 ? `${Math.round(winFrac * 100)}%` : "—"}
      </text>
    </svg>
  );
}

export default async function ProfileStatsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const combos = await getComboStats(session.user.id);
  const maxPoints = Math.max(1, ...combos.map((c) => Math.max(c.pointsScored, c.pointsSuffered)));

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/profile" className="inline-flex items-center gap-2 text-gray-400 hover:text-[#f0a500] text-sm mb-6 transition-colors">
          ← Voltar ao perfil
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-black text-white">Estatísticas dos Combos</h1>
          <p className="text-gray-400 mt-1">Desempenho detalhado de cada beyblade — pontos feitos, sofridos e tipos de finish.</p>
        </div>

        {combos.length === 0 ? (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-10 text-center">
            <div className="mb-3"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
            <p className="text-gray-500">Nenhum combo cadastrado ainda.</p>
            <Link href="/profile" className="text-[#f0a500] hover:underline text-sm mt-2 inline-block">Cadastrar combos →</Link>
          </div>
        ) : (
          <div className="space-y-6">
            {combos.map((c) => (
              <div key={c.id} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center"><img src="/bey-removebg-preview.png" alt="" className="w-4 h-4 object-contain inline-block mr-1" />{c.name}</h2>
                    {c.parts && <p className="text-xs text-gray-500 mt-0.5">{c.parts}</p>}
                  </div>
                  <div className={`text-sm font-bold px-3 py-1 rounded-full ${
                    c.pointDiff > 0 ? "bg-green-500/20 text-green-400"
                    : c.pointDiff < 0 ? "bg-red-500/20 text-red-400"
                    : "bg-gray-700 text-gray-400"
                  }`}>
                    Saldo: {c.pointDiff > 0 ? "+" : ""}{c.pointDiff} pts
                  </div>
                </div>

                <div className="grid md:grid-cols-[auto_1fr] gap-6 items-center">
                  {/* Donut + counts */}
                  <div className="flex items-center gap-4">
                    <WinLossDonut wins={c.wins} losses={c.losses} />
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /><span className="text-gray-300">{c.wins} vitórias</span></div>
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#c8102e]" /><span className="text-gray-300">{c.losses} derrotas</span></div>
                      <div className="text-gray-500 text-xs pt-1">{c.total} batalhas</div>
                    </div>
                  </div>

                  {/* Points scored vs suffered bars */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-green-400 font-medium">Pontos feitos</span>
                        <span className="text-gray-300 font-bold">{c.pointsScored}</span>
                      </div>
                      <div className="h-3 bg-[#252525] rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(c.pointsScored / maxPoints) * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-red-400 font-medium">Pontos sofridos</span>
                        <span className="text-gray-300 font-bold">{c.pointsSuffered}</span>
                      </div>
                      <div className="h-3 bg-[#252525] rounded-full overflow-hidden">
                        <div className="h-full bg-[#c8102e] rounded-full transition-all" style={{ width: `${(c.pointsSuffered / maxPoints) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Finish breakdown: scored vs suffered */}
                <div className="grid sm:grid-cols-2 gap-5 mt-6 pt-5 border-t border-[#2a2a2a]">
                  <div>
                    <h3 className="text-xs font-bold text-green-400 uppercase tracking-wide mb-3">Finishes aplicados</h3>
                    {finishOrder.every((t) => !c.finishesScored[t]) ? (
                      <p className="text-xs text-gray-600">Nenhum ponto marcado.</p>
                    ) : (
                      <div className="space-y-2">
                        {finishOrder.map((t) => {
                          const count = c.finishesScored[t] || 0;
                          if (!count) return null;
                          const totalFin = Object.values(c.finishesScored).reduce((a, b) => a + b, 0);
                          const pct = Math.round((count / totalFin) * 100);
                          return (
                            <div key={t}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-300">{FINISH_TYPE_LABELS[t]}</span>
                                <span className="text-gray-500">{count}×</span>
                              </div>
                              <div className="h-1.5 bg-[#252525] rounded-full overflow-hidden">
                                <div className={`h-full ${finishBarColors[t]} rounded-full`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wide mb-3">Finishes sofridos</h3>
                    {finishOrder.every((t) => !c.finishesSuffered[t]) ? (
                      <p className="text-xs text-gray-600">Nenhum ponto sofrido.</p>
                    ) : (
                      <div className="space-y-2">
                        {finishOrder.map((t) => {
                          const count = c.finishesSuffered[t] || 0;
                          if (!count) return null;
                          const totalFin = Object.values(c.finishesSuffered).reduce((a, b) => a + b, 0);
                          const pct = Math.round((count / totalFin) * 100);
                          return (
                            <div key={t}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-300">{FINISH_TYPE_LABELS[t]}</span>
                                <span className="text-gray-500">{count}×</span>
                              </div>
                              <div className="h-1.5 bg-[#252525] rounded-full overflow-hidden">
                                <div className={`h-full ${finishBarColors[t]} rounded-full opacity-70`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Matchup chart */}
                {c.matchups.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-[#2a2a2a]">
                    <h3 className="text-xs font-bold text-[#f0a500] uppercase tracking-wide mb-4">Desempenho contra cada oponente</h3>
                    <div className="space-y-4">
                      {c.matchups.slice(0, 10).map((mu) => {
                        const total = mu.wins + mu.losses;
                        const winPct = total > 0 ? Math.round((mu.wins / total) * 100) : 0;
                        const maxBar = Math.max(1, ...c.matchups.slice(0, 10).map((m) => m.wins + m.losses));
                        const rowPct = Math.round((total / maxBar) * 100);
                        const scoredEntries = finishOrder.filter((t) => mu.finishesScored[t]);
                        const sufferedEntries = finishOrder.filter((t) => mu.finishesSuffered[t]);
                        return (
                          <div key={mu.opponentBey} className="bg-[#252525] rounded-xl p-3">
                            {/* Opponent name + win/loss */}
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-gray-200 font-semibold truncate mr-2 flex items-center gap-1">
                                <img src="/bey-removebg-preview.png" alt="" className="w-3 h-3 object-contain inline-block opacity-60" />
                                {mu.opponentBey}
                              </span>
                              <span className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-green-400 font-semibold">{mu.wins}V</span>
                                <span className="text-gray-600">/</span>
                                <span className="text-red-400 font-semibold">{mu.losses}D</span>
                                <span className="text-gray-500 w-8 text-right">{winPct}%</span>
                              </span>
                            </div>
                            {/* Stacked bar */}
                            <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden flex mb-3" style={{ width: `${rowPct}%` }}>
                              <div className="h-full bg-green-500" style={{ width: total > 0 ? `${(mu.wins / total) * 100}%` : "0%" }} />
                              <div className="h-full bg-[#c8102e]" style={{ width: total > 0 ? `${(mu.losses / total) * 100}%` : "0%" }} />
                            </div>
                            {/* Finish tags */}
                            {(scoredEntries.length > 0 || sufferedEntries.length > 0) && (
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div>
                                  <span className="text-green-500 font-bold uppercase tracking-wide">Aplicados</span>
                                  {scoredEntries.length === 0 ? (
                                    <span className="text-gray-600 ml-1">—</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {scoredEntries.map((t) => (
                                        <span key={t} className={`px-1.5 py-0.5 rounded font-semibold ${finishColors[t]}`}>
                                          {FINISH_TYPE_LABELS[t]} ×{mu.finishesScored[t]}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <span className="text-red-400 font-bold uppercase tracking-wide">Sofridos</span>
                                  {sufferedEntries.length === 0 ? (
                                    <span className="text-gray-600 ml-1">—</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {sufferedEntries.map((t) => (
                                        <span key={t} className={`px-1.5 py-0.5 rounded font-semibold ${finishColors[t]} opacity-80`}>
                                          {FINISH_TYPE_LABELS[t]} ×{mu.finishesSuffered[t]}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {c.matchups.length > 10 && (
                      <p className="text-xs text-gray-600 mt-3">+{c.matchups.length - 10} outros oponentes</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
