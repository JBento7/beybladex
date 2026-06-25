"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LineBadge, LineButtonLabel, LINE_LABELS } from "@/components/LineBadge";
import { lookupPartWeight } from "@/lib/partWeights";

type BeyLine = "BX" | "UX" | "CX" | "BX_EXPAND" | "UX_EXPAND" | "CX_EXPAND";

interface BeyPart {
  id: string;
  line: string;
  category: string;
  name: string;
  weight: number | null;
  statAttack: number | null;
  statDefense: number | null;
  statStamina: number | null;
  statHeight: number | null;
  statDash: number | null;
  statBurst: number | null;
}

interface Beyblade {
  id: string;
  name: string;
  beyLine: string | null;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  lockChip: string | null;
  metalBlade: string | null;
  assistBlade: string | null;
  overBlade: string | null;
  wins: number;
  losses: number;
  points: number;
  hiddenFromCommunity: boolean;
  createdAt: string;
}

const ALL_LINES: BeyLine[] = ["BX", "UX", "CX", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"];

const COMBO_TYPE_LABELS: Record<string, string> = {
  ATTACK: "Ataque", DEFENSE: "Defesa", STAMINA: "Resistência", BALANCE: "Equilíbrio",
};
const COMBO_TYPE_COLORS: Record<string, string> = {
  ATTACK: "#e53e3e", DEFENSE: "#3182ce", STAMINA: "#38a169", BALANCE: "#d69e2e",
};
const COMBO_TYPE_ORDER: Record<string, number> = {
  ATTACK: 0, DEFENSE: 1, STAMINA: 2, BALANCE: 3,
};

type SortKey = "name" | "type" | "weight";
const SORT_LABELS: Record<SortKey, string> = {
  name: "Nome (A-Z)", type: "Tipo", weight: "Peso (maior)",
};

// Which BeyParts lines to pull for each category
function bladeLineFor(line: BeyLine): string {
  if (line === "BX") return "BX";
  if (line === "UX") return "UX";
  if (line === "BX_EXPAND") return "BX_EXPAND";
  if (line === "UX_EXPAND") return "UX_EXPAND";
  if (line === "CX") return "CX";
  if (line === "CX_EXPAND") return "CX_EXPAND";
  return "BX";
}

type StatKey = "statAttack" | "statDefense" | "statStamina" | "statHeight" | "statDash" | "statBurst";

const STAT_DEFS: { key: StatKey; label: string; color: string }[] = [
  { key: "statAttack",  label: "ATTACK",  color: "#e53e3e" },
  { key: "statDefense", label: "DEFENSE", color: "#3182ce" },
  { key: "statStamina", label: "STAMINA", color: "#38a169" },
  { key: "statDash",    label: "DASH",    color: "#d69e2e" },
  { key: "statBurst",   label: "BURST",   color: "#dd6b20" },
];

function sumStats(parts: (BeyPart | null | undefined)[]): Record<StatKey, number> {
  const result: Record<StatKey, number> = { statAttack: 0, statDefense: 0, statStamina: 0, statHeight: 0, statDash: 0, statBurst: 0 };
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(result) as StatKey[]) {
      result[k] += p[k] ?? 0;
    }
  }
  return result;
}

function CombinedRadarChart({ stats, size = 150 }: { stats: Record<StatKey, number>; size?: number }) {
  const axes = STAT_DEFS.filter((s) => stats[s.key] > 0);
  if (axes.length < 3) {
    const totalAll = STAT_DEFS.reduce((s, d) => s + stats[d.key], 0);
    if (totalAll === 0) return <p className="text-xs text-gray-600 italic text-center py-3">Sem stats ainda</p>;
  }
  const n = axes.length < 3 ? STAT_DEFS.length : axes.length;
  const displayAxes = axes.length < 3 ? STAT_DEFS : axes;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const labelR = size * 0.46;
  const angles = displayAxes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  const maxVal = Math.max(...displayAxes.map((s) => stats[s.key]), 1);
  const vals = displayAxes.map((s) => stats[s.key] / maxVal);
  const hasData = vals.some((v) => v > 0);

  const polyPts = (frac: number) =>
    angles.map((a) => `${cx + Math.cos(a) * r * frac},${cy + Math.sin(a) * r * frac}`).join(" ");
  const dataPath = vals.map((v, i) => `${cx + Math.cos(angles[i]) * r * v},${cy + Math.sin(angles[i]) * r * v}`);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={polyPts(f)} fill="none" stroke="#333" strokeWidth="0.8" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="#444" strokeWidth="0.8" />
      ))}
      {hasData && (
        <path d={`M${dataPath.join("L")}Z`} fill="#f0a500" fillOpacity="0.25" stroke="#f0a500" strokeWidth="1.5" />
      )}
      {angles.map((a, i) => {
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fill={displayAxes[i].color} fontSize="7" fontWeight="bold" fontFamily="sans-serif">
            {displayAxes[i].label}
          </text>
        );
      })}
    </svg>
  );
}

const EMPTY = {
  name: "",
  beyLine: "" as BeyLine | "",
  blade: "",
  ratchet: "",
  bit: "",
  lockChip: "",
  metalBlade: "",
  assistBlade: "",
  overBlade: "",
};
type FormState = typeof EMPTY;

export default function BeybladeManager() {
  const [beyblades, setBeyblades] = useState<Beyblade[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("name");

  // BeyParts catalog
  const [beyParts, setBeyParts] = useState<BeyPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(true);
  const [partsError, setPartsError] = useState(false);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(""), 3000);
  }, []);

  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current); }, []);

  const fetchBeyblades = useCallback(async () => {
    try {
      const res = await fetch("/api/beyblades");
      if (res.ok) {
        setBeyblades(await res.json());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBeyblades(); }, [fetchBeyblades]);

  useEffect(() => {
    fetch("/api/beyparts")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setBeyParts(data); setPartsError(false); })
      .catch(() => setPartsError(true))
      .finally(() => setPartsLoading(false));
  }, []);

  function partsFor(line: string, category: string): BeyPart[] {
    return beyParts
      .filter((p) => p.line === line && p.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  // Lock chip and assist blade are shared across CX and CX Expand — pool both lines, dedupe by name
  function partsForCXShared(category: string): BeyPart[] {
    const seen = new Set<string>();
    return beyParts
      .filter((p) => (p.line === "CX" || p.line === "CX_EXPAND") && p.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .filter((p) => { if (seen.has(p.name)) return false; seen.add(p.name); return true; });
  }

  function openCreate() {
    setForm(EMPTY);
    setEditingId(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(b: Beyblade) {
    setForm({
      name: b.name,
      beyLine: (b.beyLine as BeyLine) || "",
      blade: b.blade || "",
      ratchet: b.ratchet || "",
      bit: b.bit || "",
      lockChip: b.lockChip || "",
      metalBlade: b.metalBlade || "",
      assistBlade: b.assistBlade || "",
      overBlade: b.overBlade || "",
    });
    setEditingId(b.id);
    setError("");
    setShowForm(true);
  }

  const selectedLine = form.beyLine as BeyLine | "";

  // Resolve the BeyPart objects that make up a combo (by line + part names).
  function partsOf(combo: {
    beyLine: string | null;
    blade: string | null;
    ratchet: string | null;
    bit: string | null;
    lockChip: string | null;
    metalBlade: string | null;
    assistBlade: string | null;
    overBlade: string | null;
  }): (BeyPart | null)[] {
    const line = (combo.beyLine || "") as BeyLine | "";
    if (!line) return [];
    const results: (BeyPart | null)[] = [];
    if (["BX", "UX", "BX_EXPAND", "UX_EXPAND"].includes(line)) {
      results.push(beyParts.find((p) => p.name === combo.blade && p.line === bladeLineFor(line) && p.category === "BLADE") ?? null);
    }
    if (["CX", "CX_EXPAND"].includes(line)) {
      // lock chip and assist blade are shared across CX and CX_EXPAND — find in either line
      results.push(beyParts.find((p) => p.name === combo.lockChip && (p.line === "CX" || p.line === "CX_EXPAND") && p.category === "LOCK_CHIP") ?? null);
      // metal blade is exclusive to each line (CX or CX_EXPAND)
      results.push(beyParts.find((p) => p.name === combo.metalBlade && p.line === bladeLineFor(line) && p.category === "MAIN_BLADE") ?? null);
      // assist blade shared across CX and CX_EXPAND
      results.push(beyParts.find((p) => p.name === combo.assistBlade && (p.line === "CX" || p.line === "CX_EXPAND") && p.category === "ASSIST_BLADE") ?? null);
      if (line === "CX_EXPAND") {
        results.push(beyParts.find((p) => p.name === combo.overBlade && p.line === "CX_EXPAND" && p.category === "OVER_BLADE") ?? null);
      }
    }
    // Ratchet (not for UX_EXPAND)
    if (["BX", "UX", "BX_EXPAND", "CX", "CX_EXPAND"].includes(line)) {
      results.push(beyParts.find((p) => p.name === combo.ratchet && p.line === "RATCHET" && p.category === "RATCHET") ?? null);
    }
    // Bit
    results.push(beyParts.find((p) => p.name === combo.bit && p.line === "BIT" && p.category === "BIT") ?? null);
    return results;
  }

  function getSelectedParts(): (BeyPart | null)[] {
    return partsOf({
      beyLine: form.beyLine || null,
      blade: form.blade || null,
      ratchet: form.ratchet || null,
      bit: form.bit || null,
      lockChip: form.lockChip || null,
      metalBlade: form.metalBlade || null,
      assistBlade: form.assistBlade || null,
      overBlade: form.overBlade || null,
    });
  }

  // Total weight (g) of a combo, plus how many of its parts had a known weight.
  // Usa o peso salvo da peça ou, na falta, o peso de referência pesquisado pelo nome.
  function comboWeight(parts: (BeyPart | null)[]): { total: number; known: number; missing: number } {
    let total = 0, known = 0, missing = 0;
    for (const p of parts) {
      if (!p) continue;
      const w = p.weight ?? lookupPartWeight(p.name);
      if (w != null) { total += w; known++; }
      else missing++;
    }
    return { total: Math.round(total * 10) / 10, known, missing };
  }

  // Tipo dominante do combo (Ataque/Defesa/Resistência/Equilíbrio) pelos stats somados.
  type ComboType = "ATTACK" | "DEFENSE" | "STAMINA" | "BALANCE";
  function comboType(parts: (BeyPart | null)[]): ComboType | null {
    const s = sumStats(parts);
    const atk = s.statAttack, def = s.statDefense, sta = s.statStamina;
    if (atk === 0 && def === 0 && sta === 0) return null;
    const max = Math.max(atk, def, sta);
    const close = [atk, def, sta].filter((v) => v >= max * 0.85).length;
    if (close >= 3) return "BALANCE";
    if (atk === max) return "ATTACK";
    if (def === max) return "DEFENSE";
    return "STAMINA";
  }

  const combinedStats = sumStats(getSelectedParts());
  const formWeight = comboWeight(getSelectedParts());

  const sortedBeyblades = [...beyblades].sort((a, b) => {
    if (sortBy === "weight") {
      const wa = comboWeight(partsOf(a)).total;
      const wb = comboWeight(partsOf(b)).total;
      if (wb !== wa) return wb - wa; // maior peso primeiro
      return a.name.localeCompare(b.name, "pt-BR");
    }
    if (sortBy === "type") {
      const ta = comboType(partsOf(a));
      const tb = comboType(partsOf(b));
      const oa = ta ? COMBO_TYPE_ORDER[ta] : 99;
      const ob = tb ? COMBO_TYPE_ORDER[tb] : 99;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name, "pt-BR");
    }
    return a.name.localeCompare(b.name, "pt-BR");
  });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const url = editingId ? `/api/beyblades/${editingId}` : "/api/beyblades";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        beyLine: form.beyLine || null,
        blade: form.blade || null,
        ratchet: form.ratchet || null,
        bit: form.bit || null,
        lockChip: form.lockChip || null,
        metalBlade: form.metalBlade || null,
        assistBlade: form.assistBlade || null,
        overBlade: form.overBlade || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      flashSuccess("Combo salvo!");
      fetchBeyblades();
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao salvar combo");
    }
  }

  async function handleResetStats(id: string) {
    setResettingId(id);
    try {
      const res = await fetch(`/api/beyblades/${id}/reset-stats`, { method: "POST" });
      if (res.ok) {
        setConfirmResetId(null);
        flashSuccess("Estatísticas zeradas!");
        fetchBeyblades();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao zerar estatísticas.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setResettingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError("");
    try {
      const res = await fetch(`/api/beyblades/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Erro ao remover combo.");
        return;
      }
      setConfirmingId(null);
      flashSuccess("Combo removido!");
      await fetchBeyblades();
    } catch {
      setDeleteError("Erro ao remover combo.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleHidden(b: Beyblade) {
    setTogglingId(b.id);
    try {
      const res = await fetch(`/api/beyblades/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenFromCommunity: !b.hiddenFromCommunity }),
      });
      if (res.ok) {
        flashSuccess(!b.hiddenFromCommunity ? "Combo trancado!" : "Combo destrancado!");
        fetchBeyblades();
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setTogglingId(null);
    }
  }

  function comboParts(b: Beyblade) {
    if (b.beyLine && ["CX", "CX_EXPAND"].includes(b.beyLine)) {
      return [b.lockChip, b.overBlade, b.metalBlade, b.assistBlade, b.ratchet, b.bit].filter(Boolean).join(" / ");
    }
    return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
  }

  function PartSelect({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: BeyPart[];
    onChange: (v: string) => void;
  }) {
    const inputClass = "w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-3 py-2.5 text-white outline-none transition-colors text-sm";

    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>

        {partsLoading ? (
          <div className={`${inputClass} text-gray-500 flex items-center gap-2`}>
            <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Carregando catálogo...
          </div>
        ) : partsError ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Digite o nome — catálogo indisponível`}
            className={inputClass + " placeholder-gray-600"}
          />
        ) : options.length > 0 ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Selecionar...</option>
            {options.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Nenhuma peça cadastrada — digite o nome`}
            className={inputClass + " placeholder-gray-600"}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Meus Combos (Beyblades)</h2>
        <button
          onClick={() => (showForm ? setShowForm(false) : openCreate())}
          className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Cancelar" : "+ Adicionar Combo"}
        </button>
      </div>

      {success && (
        <div className="mb-4 text-green-400 text-sm bg-green-900/20 border border-green-700/30 px-3 py-2 rounded-lg">
          {success}
        </div>
      )}

      {deleteError && (
        <div className="mb-4 text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
          {deleteError}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="mb-5 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-4">
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Apelido do Combo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="ex: Meu Atacante"
              className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          {/* Line selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Linha de Beyblade</label>
            <div className="flex flex-wrap gap-2">
              {ALL_LINES.map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => setForm({ ...EMPTY, name: form.name, beyLine: line })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    form.beyLine === line ? "bg-[#f0a500] text-black" : "bg-[#1a1a1a] border border-[#333] text-gray-400 hover:text-white"
                  }`}
                >
                  <LineButtonLabel line={line} />
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic part selectors */}
          {selectedLine && (
            <div className="space-y-3">
              {/* BX / UX / BX_EXPAND / UX_EXPAND — Blade */}
              {["BX", "UX", "BX_EXPAND", "UX_EXPAND"].includes(selectedLine) && (
                <PartSelect
                  label="Blade"
                  value={form.blade}
                  options={partsFor(bladeLineFor(selectedLine), "BLADE")}
                  onChange={(v) => setForm((f) => ({ ...f, blade: v }))}
                />
              )}

              {/* CX / CX_EXPAND */}
              {["CX", "CX_EXPAND"].includes(selectedLine) && (
                <>
                  {/* Lock chip and assist blade shared across CX and CX Expand */}
                  <PartSelect
                    label="Lock Chip"
                    value={form.lockChip}
                    options={partsForCXShared("LOCK_CHIP")}
                    onChange={(v) => setForm((f) => ({ ...f, lockChip: v }))}
                  />
                  {selectedLine === "CX_EXPAND" && (
                    <PartSelect
                      label="Over Blade"
                      value={form.overBlade}
                      options={partsFor("CX_EXPAND", "OVER_BLADE")}
                      onChange={(v) => setForm((f) => ({ ...f, overBlade: v }))}
                    />
                  )}
                  {/* Metal blade exclusive per line */}
                  <PartSelect
                    label="Metal Blade"
                    value={form.metalBlade}
                    options={partsFor(bladeLineFor(selectedLine), "MAIN_BLADE")}
                    onChange={(v) => setForm((f) => ({ ...f, metalBlade: v }))}
                  />
                  {/* Assist blade shared across CX and CX Expand */}
                  <PartSelect
                    label="Assist Blade"
                    value={form.assistBlade}
                    options={partsForCXShared("ASSIST_BLADE")}
                    onChange={(v) => setForm((f) => ({ ...f, assistBlade: v }))}
                  />
                </>
              )}

              {/* Ratchet — BX, UX, BX_EXPAND, CX, CX_EXPAND (not UX_EXPAND) */}
              {["BX", "UX", "BX_EXPAND", "CX", "CX_EXPAND"].includes(selectedLine) && (
                <PartSelect
                  label="Ratchet"
                  value={form.ratchet}
                  options={partsFor("RATCHET", "RATCHET")}
                  onChange={(v) => setForm((f) => ({ ...f, ratchet: v }))}
                />
              )}

              {/* Bit — all lines */}
              <PartSelect
                label="Bit"
                value={form.bit}
                options={partsFor("BIT", "BIT")}
                onChange={(v) => setForm((f) => ({ ...f, bit: v }))}
              />

              {/* Total weight preview */}
              {formWeight.known > 0 && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Peso total</span>
                  <span className="text-lg font-black text-[#f0a500]">
                    {formWeight.total}g
                    {formWeight.missing > 0 && (
                      <span className="text-[10px] font-medium text-gray-500 ml-1">(peças sem peso: {formWeight.missing})</span>
                    )}
                  </span>
                </div>
              )}

              {/* Combined radar chart preview */}
              {Object.values(combinedStats).some((v) => v > 0) && (
                <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-400 mb-3 text-center uppercase tracking-wider">Stats do Combo</p>
                  <div className="flex flex-col items-center gap-3">
                    <CombinedRadarChart stats={combinedStats} size={160} />
                    <div className="w-full space-y-1.5">
                      {STAT_DEFS.filter((s) => combinedStats[s.key] > 0).map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold w-14 text-right" style={{ color: s.color }}>{s.label}</span>
                          <div className="flex-1 h-1.5 bg-[#111] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min((combinedStats[s.key] / Math.max(...STAT_DEFS.map((d) => combinedStats[d.key]), 1)) * 100, 100)}%`,
                                backgroundColor: s.color,
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-white w-8">{combinedStats[s.key]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-lg transition-colors"
          >
            {saving ? "Salvando..." : editingId ? "Salvar Alterações" : "Adicionar"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-4 text-center">Carregando...</div>
      ) : loadError ? (
        <div className="text-center py-8">
          <p className="text-red-400 text-sm mb-3">Erro ao carregar seus combos.</p>
          <button
            onClick={() => { setLoading(true); fetchBeyblades(); }}
            className="text-[#f0a500] hover:underline text-sm font-medium"
          >
            Tentar novamente
          </button>
        </div>
      ) : beyblades.length === 0 ? (
        <div className="text-center py-8">
          <div className="mb-3"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain mx-auto" /></div>
          <p className="text-gray-500 text-sm">Nenhum combo registrado ainda</p>
          <p className="text-gray-600 text-xs mt-1">Cadastre seus combos para usá-los nos torneios</p>
        </div>
      ) : (
        <>
        {/* Ordenação dos combos */}
        <div className="flex items-center justify-end gap-2 mb-3">
          <span className="text-xs text-gray-500">Ordenar por:</span>
          <div className="flex gap-1">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  sortBy === k ? "bg-[#f0a500] text-black" : "bg-[#252525] text-gray-400 hover:text-white"
                }`}
              >
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedBeyblades.map((b) => {
            const total = b.wins + b.losses;
            const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;
            const parts = comboParts(b);
            const weight = comboWeight(partsOf(b));
            const type = comboType(partsOf(b));
            return (
              <div key={b.id} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate flex items-center gap-1.5">
                      {b.name}
                      {b.hiddenFromCommunity && (
                        <span className="text-[10px] bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                          🔒 Trancado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {b.beyLine && <LineBadge line={b.beyLine} />}
                      {type && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                          style={{ color: COMBO_TYPE_COLORS[type], borderColor: `${COMBO_TYPE_COLORS[type]}55`, backgroundColor: `${COMBO_TYPE_COLORS[type]}1a` }}
                        >
                          {COMBO_TYPE_LABELS[type]}
                        </span>
                      )}
                    </div>
                    {parts && <div className="text-xs text-gray-500 mt-0.5 truncate">{parts}</div>}
                    {weight.known > 0 && (
                      <div className="text-xs mt-1">
                        <span className="text-gray-500">Peso total: </span>
                        <span className="font-bold text-[#f0a500]">{weight.total}g</span>
                        {weight.missing > 0 && (
                          <span className="text-gray-600"> (+{weight.missing} sem peso)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {confirmingId === b.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        {deletingId === b.id ? (
                          <span className="text-gray-400">Removendo...</span>
                        ) : (
                          <>
                            <span className="text-gray-400">Remover?</span>
                            <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-300 font-semibold transition-colors">Sim</button>
                            <button onClick={() => setConfirmingId(null)} className="text-gray-400 hover:text-gray-200 font-semibold transition-colors">Não</button>
                          </>
                        )}
                      </div>
                    ) : confirmResetId === b.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        {resettingId === b.id ? (
                          <span className="text-gray-400">Zerando...</span>
                        ) : (
                          <>
                            <span className="text-gray-400">Zerar stats?</span>
                            <button onClick={() => handleResetStats(b.id)} className="text-amber-400 hover:text-amber-300 font-semibold transition-colors">Sim</button>
                            <button onClick={() => setConfirmResetId(null)} className="text-gray-400 hover:text-gray-200 font-semibold transition-colors">Não</button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggleHidden(b)}
                          disabled={togglingId === b.id}
                          className={`disabled:opacity-50 transition-colors text-xs ${b.hiddenFromCommunity ? "text-[#f0a500]" : "text-gray-600 hover:text-[#f0a500]"}`}
                          title={b.hiddenFromCommunity ? "Destrancar" : "Trancar"}
                        >
                          {b.hiddenFromCommunity ? "🔒" : "🔓"}
                        </button>
                        <button onClick={() => openEdit(b)} disabled={deletingId === b.id} className="text-gray-600 hover:text-[#f0a500] disabled:opacity-50 transition-colors text-xs" title="Editar">✎</button>
                        <button onClick={() => { setDeleteError(""); setConfirmingId(b.id); }} disabled={deletingId === b.id} className="text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors text-xs" title="Remover">✕</button>
                        <button onClick={() => setConfirmResetId(b.id)} disabled={deletingId === b.id} className="text-gray-600 hover:text-amber-400 disabled:opacity-50 transition-colors text-xs" title="Zerar estatísticas">↺</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-lg font-black text-green-400">{b.wins}</div>
                    <div className="text-xs text-gray-500">Vit.</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-red-400">{b.losses}</div>
                    <div className="text-xs text-gray-500">Der.</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-blue-400">{winRate}%</div>
                    <div className="text-xs text-gray-500">Taxa</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-[#f0a500]">{b.points ?? 0}</div>
                    <div className="text-xs text-gray-500">Pts</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
