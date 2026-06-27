"use client";

import { useEffect, useState } from "react";
import { LineBadge } from "@/components/LineBadge";

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
  verdict: "EXCELENTE" | "BOM" | "MEDIANO" | "FRACO";
  worthIt: boolean;
  reasons: string[];
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
  const [bladeId, setBladeId] = useState("");
  const [ratchetId, setRatchetId] = useState("");
  const [bitId, setBitId] = useState("");
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

  const blades = parts.filter((p) => p.category === "BLADE");
  const ratchets = parts.filter((p) => p.category === "RATCHET");
  const bits = parts.filter((p) => p.category === "BIT");

  async function analyze() {
    if (!bladeId || !ratchetId || !bitId) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/combos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bladeId, ratchetId, bitId }),
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

  const ready = bladeId && ratchetId && bitId;

  return (
    <div>
      <p className="text-gray-400 text-sm mb-4">
        Monte sua beyblade escolhendo as peças e a IA estima as probabilidades e se vale a pena usar
        esse combo.
      </p>

      {loadingParts ? (
        <div className="text-center text-gray-400 py-8">Carregando peças…</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <Selector label="Blade" parts={blades} value={bladeId} onChange={setBladeId} />
            <Selector label="Ratchet" parts={ratchets} value={ratchetId} onChange={setRatchetId} />
            <Selector label="Bit" parts={bits} value={bitId} onChange={setBitId} />
          </div>

          <button
            onClick={analyze}
            disabled={!ready || analyzing}
            className="w-full sm:w-auto bg-[#f0a500] hover:bg-[#d99400] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-3 rounded-xl transition-colors"
          >
            {analyzing ? "Analisando…" : "Analisar combo"}
          </button>
        </>
      )}

      {error && (
        <div className="mt-4 bg-[#c8102e]/10 border border-[#c8102e]/40 rounded-xl p-4 text-[#ff6b81] text-sm">
          {error}
        </div>
      )}

      {analysis && (
        <div className="mt-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
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
              <span>Posição: #{analysis.rank} de {analysis.totalCombos} combos</span>
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
      )}
    </div>
  );
}

function Selector({
  label,
  parts,
  value,
  onChange,
}: {
  label: string;
  parts: Part[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = parts.find((p) => p.id === value);
  return (
    <div>
      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
        {label}
        {selected &&
          ["BX", "UX", "CX", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"].includes(selected.line) && (
            <LineBadge line={selected.line} className="h-3" />
          )}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#252525] border border-[#3a3a3a] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#f0a500] outline-none"
      >
        <option value="">Selecione…</option>
        {parts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
