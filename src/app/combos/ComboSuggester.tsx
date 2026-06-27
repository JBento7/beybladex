"use client";

import { useEffect, useState, useCallback } from "react";
import { LineBadge } from "@/components/LineBadge";

type Part = {
  id: string;
  line: string;
  name: string;
  imageUrl: string | null;
};

type Suggestion = {
  blade: Part;
  ratchet: Part;
  bit: Part;
  score: number;
  styleScore: number;
  communityScore: number;
  sampleSize: number;
  totals: { attack: number; defense: number; stamina: number; burst: number };
};

type ApiResponse = {
  style: string;
  ownedOnly: boolean;
  counts: { blades: number; ratchets: number; bits: number };
  suggestions: Suggestion[];
};

const STYLES = [
  { key: "ATTACK", label: "Ataque", color: "#c8102e", emoji: "⚔️" },
  { key: "DEFENSE", label: "Defesa", color: "#3b82f6", emoji: "🛡️" },
  { key: "STAMINA", label: "Stamina", color: "#22c55e", emoji: "🔄" },
] as const;

export default function ComboSuggester() {
  const [style, setStyle] = useState<string>("ATTACK");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/combos/suggest?style=${style}&owned=${ownedOnly ? "1" : "0"}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Erro ao carregar sugestões");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [style, ownedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const activeStyle = STYLES.find((s) => s.key === style) ?? STYLES[0];

  return (
    <div>
      {/* Seletor de estilo */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {STYLES.map((s) => {
          const active = s.key === style;
          return (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`rounded-xl py-3 px-2 text-center font-semibold transition-all border ${
                active
                  ? "border-transparent text-white"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]"
              }`}
              style={active ? { backgroundColor: s.color } : undefined}
            >
              <div className="text-2xl leading-none mb-1">{s.emoji}</div>
              <div className="text-sm">{s.label}</div>
            </button>
          );
        })}
      </div>

      {/* Toggle só minhas peças */}
      <label className="flex items-center gap-2 mb-6 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={ownedOnly}
          onChange={(e) => setOwnedOnly(e.target.checked)}
          className="w-4 h-4 accent-[#f0a500]"
        />
        <span className="text-sm text-gray-300">Usar apenas as peças que eu tenho cadastradas</span>
      </label>

      {loading && <div className="text-center text-gray-400 py-12">Calculando combos…</div>}

      {error && (
        <div className="bg-[#c8102e]/10 border border-[#c8102e]/40 rounded-xl p-4 text-[#ff6b81] text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && data.suggestions.length === 0 && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 text-center text-gray-400">
          {ownedOnly
            ? "Você ainda não tem peças suficientes cadastradas (precisa de blade, ratchet e bit)."
            : "Nenhuma peça cadastrada no sistema ainda."}
        </div>
      )}

      {!loading && !error && data && data.suggestions.length > 0 && (
        <div className="space-y-3">
          {data.suggestions.map((sug, i) => (
            <div
              key={`${sug.blade.id}-${sug.ratchet.id}-${sug.bit.id}`}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: i < 3 ? activeStyle.color : "#3a3a3a" }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-bold text-white">
                    {sug.blade.name} {sug.ratchet.name} {sug.bit.name}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: activeStyle.color }}>
                    {sug.score.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">pontos</div>
                </div>
              </div>

              {/* Peças */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <PartCell label="Blade" part={sug.blade} />
                <PartCell label="Ratchet" part={sug.ratchet} />
                <PartCell label="Bit" part={sug.bit} />
              </div>

              {/* Stats agregados */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                <span>⚔️ Atk <b className="text-gray-200">{sug.totals.attack}</b></span>
                <span>🛡️ Def <b className="text-gray-200">{sug.totals.defense}</b></span>
                <span>🔄 Sta <b className="text-gray-200">{sug.totals.stamina}</b></span>
                <span>💥 Burst <b className="text-gray-200">{sug.totals.burst}</b></span>
                {sug.sampleSize > 0 && (
                  <span className="text-[#f0a500]">
                    📊 {sug.communityScore.toFixed(0)}% win ({sug.sampleSize} partidas)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartCell({ label, part }: { label: string; part: Part }) {
  return (
    <div className="bg-[#252525] rounded-lg p-2 flex items-center gap-2">
      {part.imageUrl ? (
        <img src={part.imageUrl} alt={part.name} className="w-9 h-9 object-contain flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded bg-[#333] flex-shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
          {label}
          {["BX", "UX", "CX", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"].includes(part.line) && (
            <LineBadge line={part.line} className="h-3" />
          )}
        </div>
        <div className="text-sm text-white truncate">{part.name}</div>
      </div>
    </div>
  );
}
