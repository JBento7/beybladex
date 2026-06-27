"use client";

import { useEffect, useMemo, useState } from "react";
import { LineBadge, LineButtonLabel } from "@/components/LineBadge";
import { COMBO_LINES, slotsForLine, type ComboLine } from "@/lib/combo-lines";

type Part = {
  id: string;
  line: string;
  category: string;
  name: string;
  imageUrl: string | null;
};

type Analysis = {
  totals: { attack: number; defense: number; stamina: number; burst: number };
  styleScores: { ATTACK: number; DEFENSE: number; STAMINA: number };
  bestStyle: "ATTACK" | "DEFENSE" | "STAMINA";
  bestStyleScore: number;
  communityScore: number | null;
  sampleSize: number;
  percentile: number;
  rank: number;
  totalCombos: number;
  metaScore: number | null;
  metaParts: { name: string; tier: "S" | "A" | "B" | "C"; note?: string }[];
  verdict: "EXCELENTE" | "BOM" | "MEDIANO" | "FRACO";
  worthIt: boolean;
  reasons: string[];
};

const TIER_COLOR: Record<"S" | "A" | "B" | "C", string> = {
  S: "#f0a500",
  A: "#22c55e",
  B: "#3b82f6",
  C: "#6b7280",
};

const STYLE_LABEL = { ATTACK: "Ataque", DEFENSE: "Defesa", STAMINA: "Stamina" } as const;
const STYLE_COLOR = { ATTACK: "#c8102e", DEFENSE: "#3b82f6", STAMINA: "#22c55e" } as const;

const VERDICT_STYLE: Record<Analysis["verdict"], { color: string; emoji: string }> = {
  EXCELENTE: { color: "#22c55e", emoji: "🏆" },
  BOM: { color: "#84cc16", emoji: "👍" },
  MEDIANO: { color: "#f0a500", emoji: "🤔" },
  FRACO: { color: "#c8102e", emoji: "👎" },
};

export default function ComboAnalyzer() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loadingParts, setLoadingParts] = useState(true);
  const [line, setLine] = useState<ComboLine | "">("");
  // map slotKey -> partId
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/beyparts");
        if (!res.ok) throw new Error("Erro ao carregar peças");
        setParts(await res.json());
      } catch {
        setError("Não foi possível carregar as peças.");
      } finally {
        setLoadingParts(false);
      }
    })();
  }, []);

  const slots = useMemo(() => (line ? slotsForLine(line as ComboLine) : []), [line]);

  function chooseLine(l: ComboLine) {
    setLine(l);
    setPicks({});
    setAnalysis(null);
    setError(null);
  }

  function optionsFor(category: string, lines: string[]): Part[] {
    return parts.filter((p) => p.category === category && lines.includes(p.line));
  }

  const ready = slots.length > 0 && slots.every((s) => picks[s.key]);

  async function analyze() {
    if (!ready || !line) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const partIds = slots.map((s) => picks[s.key]);
      const res = await fetch("/api/combos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line, partIds }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao analisar");
      setAnalysis(j.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      {/* Passo 1 — Escolha a linha */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <StepBadge n={1} />
          <h3 className="font-bold text-white">Escolha a linha</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {COMBO_LINES.map((l) => (
            <button
              key={l}
              onClick={() => chooseLine(l)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                line === l
                  ? "bg-[#f0a500] text-black"
                  : "bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-white"
              }`}
            >
              <LineButtonLabel line={l} />
            </button>
          ))}
        </div>
      </div>

      {/* Passo 2 — Monte o combo */}
      {line && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <StepBadge n={2} />
            <h3 className="font-bold text-white">Monte o combo</h3>
          </div>

          {loadingParts ? (
            <div className="text-gray-400 text-sm py-4">Carregando peças…</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {slots.map((slot) => {
                const opts = optionsFor(slot.category, slot.lines);
                const sel = opts.find((p) => p.id === picks[slot.key]);
                return (
                  <div key={slot.key}>
                    <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                      {slot.label}
                      {sel &&
                        ["BX", "UX", "CX", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"].includes(
                          sel.line
                        ) && <LineBadge line={sel.line} className="h-3" />}
                    </label>
                    <select
                      value={picks[slot.key] ?? ""}
                      onChange={(e) =>
                        setPicks((p) => ({ ...p, [slot.key]: e.target.value }))
                      }
                      className="w-full bg-[#252525] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#f0a500] outline-none"
                    >
                      <option value="">
                        {opts.length ? "Selecione…" : "Nenhuma peça cadastrada"}
                      </option>
                      {opts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={analyze}
            disabled={!ready || analyzing}
            className="mt-4 w-full sm:w-auto bg-[#f0a500] hover:bg-[#d99400] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-3 rounded-xl transition-colors"
          >
            {analyzing ? "Analisando…" : "Analisar combo"}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 bg-[#c8102e]/10 border border-[#c8102e]/40 rounded-xl p-4 text-[#ff6b81] text-sm">
          {error}
        </div>
      )}

      {/* Passo 3 — Resultado */}
      {analysis && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StepBadge n={3} />
            <h3 className="font-bold text-white">Resultado</h3>
          </div>
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
            {/* Veredito */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Veredito da IA</div>
                <div
                  className="text-2xl font-black flex items-center gap-2"
                  style={{ color: VERDICT_STYLE[analysis.verdict].color }}
                >
                  {VERDICT_STYLE[analysis.verdict].emoji} {analysis.verdict}
                </div>
              </div>
              <div
                className="text-sm font-bold px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: analysis.worthIt ? "#22c55e22" : "#c8102e22",
                  color: analysis.worthIt ? "#22c55e" : "#ff6b81",
                }}
              >
                {analysis.worthIt ? "Vale a pena usar" : "Dá pra melhorar"}
              </div>
            </div>

            {/* Barra de percentil */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>
                  Posição: #{analysis.rank} de {analysis.totalCombos} combos
                </span>
                <span>Top {Math.max(1, 100 - analysis.percentile)}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-[#2a2a2a] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${analysis.percentile}%`,
                    backgroundColor: STYLE_COLOR[analysis.bestStyle],
                  }}
                />
              </div>
            </div>

            {/* Estilo + scores */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["ATTACK", "DEFENSE", "STAMINA"] as const).map((st) => {
                const isBest = st === analysis.bestStyle;
                return (
                  <div
                    key={st}
                    className="rounded-lg p-2 text-center border"
                    style={{
                      borderColor: isBest ? STYLE_COLOR[st] : "#2a2a2a",
                      backgroundColor: isBest ? `${STYLE_COLOR[st]}18` : "#252525",
                    }}
                  >
                    <div className="text-[10px] text-gray-400 uppercase">{STYLE_LABEL[st]}</div>
                    <div className="text-lg font-bold" style={{ color: STYLE_COLOR[st] }}>
                      {analysis.styleScores[st].toFixed(0)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Meta mundial (tier list) */}
            <div className="mb-4 bg-[#252525] border border-[#2a2a2a] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 uppercase tracking-wide">🌍 Meta mundial</span>
                {analysis.metaScore !== null && (
                  <span className="text-sm font-bold text-[#f0a500]">
                    {analysis.metaScore.toFixed(0)}/100
                  </span>
                )}
              </div>
              {analysis.metaParts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.metaParts.map((m) => (
                    <span
                      key={m.name}
                      title={m.note}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                      style={{ backgroundColor: `${TIER_COLOR[m.tier]}22`, color: TIER_COLOR[m.tier] }}
                    >
                      <b>{m.tier}</b>
                      <span className="text-gray-300">{m.name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Nenhuma destas peças está no tier list do meta competitivo ainda.
                </p>
              )}
            </div>

            {/* Win rate */}
            {analysis.communityScore !== null && (
              <div className="mb-4 text-sm text-[#f0a500]">
                📊 Win rate da comunidade: <b>{analysis.communityScore.toFixed(0)}%</b> em{" "}
                {analysis.sampleSize} partidas
              </div>
            )}

            {/* Stats agregados */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-4">
              <span>⚔️ Atk <b className="text-gray-200">{analysis.totals.attack}</b></span>
              <span>🛡️ Def <b className="text-gray-200">{analysis.totals.defense}</b></span>
              <span>🔄 Sta <b className="text-gray-200">{analysis.totals.stamina}</b></span>
              <span>💥 Burst <b className="text-gray-200">{analysis.totals.burst}</b></span>
            </div>

            {/* Razões */}
            <div className="border-t border-[#2a2a2a] pt-3 space-y-1.5">
              {analysis.reasons.map((r, i) => (
                <div key={i} className="flex gap-2 text-sm text-gray-300">
                  <span className="text-[#f0a500]">•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f0a500] text-black text-xs font-black flex-shrink-0">
      {n}
    </span>
  );
}
