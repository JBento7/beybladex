"use client";

import { useState, useEffect, useCallback } from "react";

type Line = "BX" | "UX" | "CX" | "RATCHET" | "BIT" | "BX_EXPAND" | "UX_EXPAND" | "CX_EXPAND";
type Category = "BLADE" | "RATCHET" | "BIT" | "LOCK_CHIP" | "MAIN_BLADE" | "ASSIST_BLADE" | "OVER_BLADE";

type PartType = "ATTACK" | "DEFENSE" | "STAMINA" | "BALANCE";

const PART_TYPE_LABELS: Record<PartType, string> = {
  ATTACK:  "Ataque",
  DEFENSE: "Defesa",
  STAMINA: "Resistência",
  BALANCE: "Equilíbrio",
};

const PART_TYPE_IMAGES: Record<PartType, string> = {
  ATTACK:  "/ataque.png",
  DEFENSE: "/defesa.png",
  STAMINA: "/resistencia.png",
  BALANCE: "/equilibrio.png",
};

// Categories that show a type badge (Ataque/Defesa/etc.)
const TYPE_BADGE_CATEGORIES: Category[] = ["BLADE", "OVER_BLADE", "MAIN_BLADE", "ASSIST_BLADE"];
// Subset of above where type is set manually (no stats)
const TYPE_ONLY_CATEGORIES: Category[] = ["OVER_BLADE", "ASSIST_BLADE"];
// Subset where type is auto-derived from dominant stat
const AUTO_TYPE_CATEGORIES: Category[] = ["BLADE", "MAIN_BLADE"];

function autoDetectType(part: BeyPart): PartType | null {
  const atk = part.statAttack ?? 0;
  const def = part.statDefense ?? 0;
  const sta = part.statStamina ?? 0;
  if (atk === 0 && def === 0 && sta === 0) return null;
  const max = Math.max(atk, def, sta);
  const threshold = max * 0.85; // within 15% of max = "balanced"
  const close = [atk, def, sta].filter((v) => v >= threshold).length;
  if (close >= 3) return "BALANCE";
  if (atk === max) return "ATTACK";
  if (def === max) return "DEFENSE";
  return "STAMINA";
}

function resolvedType(part: BeyPart): PartType | null {
  if (AUTO_TYPE_CATEGORIES.includes(part.category)) return autoDetectType(part);
  return (part.partType as PartType | null) ?? null;
}

interface BeyPart {
  id: string;
  line: Line;
  category: Category;
  name: string;
  imageUrl: string | null;
  partType: string | null;
  statAttack: number | null;
  statDefense: number | null;
  statStamina: number | null;
  statHeight: number | null;
  statDash: number | null;
  statBurst: number | null;
}

const LINE_LABELS: Record<Line, string> = {
  BX: "Linha BX",
  UX: "Linha UX",
  CX: "Linha CX",
  RATCHET: "Ratchet",
  BIT: "Bit",
  BX_EXPAND: "BX Expand",
  UX_EXPAND: "UX Expand",
  CX_EXPAND: "CX Expand",
};

const CATEGORY_LABELS: Record<Category, string> = {
  BLADE: "Blade",
  RATCHET: "Ratchet",
  BIT: "Bit",
  LOCK_CHIP: "Lock Chip",
  OVER_BLADE: "Over Blade",
  MAIN_BLADE: "Metal Blade",
  ASSIST_BLADE: "Assist Blade",
};

const LINE_CATEGORIES: Record<Line, Category[]> = {
  BX: ["BLADE"],
  UX: ["BLADE"],
  CX: ["LOCK_CHIP", "MAIN_BLADE", "ASSIST_BLADE"],
  RATCHET: ["RATCHET"],
  BIT: ["BIT"],
  BX_EXPAND: ["BLADE"],
  UX_EXPAND: ["BLADE"],
  CX_EXPAND: ["LOCK_CHIP", "OVER_BLADE", "MAIN_BLADE", "ASSIST_BLADE"],
};

// Stats shown per category
type StatKey = "statAttack" | "statDefense" | "statStamina" | "statHeight" | "statDash" | "statBurst";

interface StatDef {
  key: StatKey;
  label: string;
  color: string;
}

const ALL_STATS: StatDef[] = [
  { key: "statAttack",  label: "ATTACK",  color: "#e53e3e" },
  { key: "statDefense", label: "DEFENSE", color: "#3182ce" },
  { key: "statStamina", label: "STAMINA", color: "#38a169" },
  { key: "statHeight",  label: "HEIGHT",  color: "#805ad5" },
  { key: "statDash",    label: "DASH",    color: "#d69e2e" },
  { key: "statBurst",   label: "BURST",   color: "#dd6b20" },
];

const CATEGORY_STATS: Record<Category, StatKey[]> = {
  BLADE:        ["statAttack", "statDefense", "statStamina"],
  RATCHET:      ["statAttack", "statDefense", "statStamina", "statHeight"],
  BIT:          ["statAttack", "statDefense", "statStamina", "statDash", "statBurst"],
  LOCK_CHIP:    [],
  OVER_BLADE:   [],
  MAIN_BLADE:   ["statAttack", "statDefense", "statStamina"],
  ASSIST_BLADE: [],
};

const STAT_MAX: Record<StatKey, number> = {
  statAttack: 100,
  statDefense: 100,
  statStamina: 100,
  statHeight: 100,
  statDash: 100,
  statBurst: 100,
};

function statDef(key: StatKey): StatDef {
  return ALL_STATS.find((s) => s.key === key)!;
}

// Radar chart — axes = relevant stats for that category
function RadarChart({ part, size = 130 }: { part: BeyPart; size?: number }) {
  const axes = CATEGORY_STATS[part.category];
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const labelR = size * 0.46;

  if (n < 3) return null;

  const angles = axes.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
  const vals = axes.map((k) => Math.min((part[k] ?? 0) / STAT_MAX[k], 1));
  const hasData = vals.some((v) => v > 0);

  const polyPts = (frac: number) =>
    angles.map((a) => `${cx + Math.cos(a) * r * frac},${cy + Math.sin(a) * r * frac}`).join(" ");

  const dataPath = () => {
    const pts = vals.map((v, i) =>
      `${cx + Math.cos(angles[i]) * r * v},${cy + Math.sin(angles[i]) * r * v}`
    );
    return `M${pts.join("L")}Z`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <polygon key={frac} points={polyPts(frac)} fill="none" stroke="#333" strokeWidth="0.8" />
      ))}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="#444" strokeWidth="0.8" />
      ))}
      {hasData && (
        <path d={dataPath()} fill="#f0a500" fillOpacity="0.25" stroke="#f0a500" strokeWidth="1.5" />
      )}
      {angles.map((a, i) => {
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        const sd = statDef(axes[i]);
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
            fill={sd.color} fontSize="7" fontWeight="bold" fontFamily="sans-serif">
            {sd.label}
          </text>
        );
      })}
    </svg>
  );
}

// Horizontal stat bars like the physical card
function StatBars({ part }: { part: BeyPart }) {
  const axes = CATEGORY_STATS[part.category];
  return (
    <div className="space-y-1.5">
      {axes.map((key) => {
        const sd = statDef(key);
        const val = part[key] ?? null;
        const pct = val != null ? Math.min((val / STAT_MAX[key]) * 100, 100) : 0;
        return (
          <div key={key}>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: sd.color }}>
                {sd.label}
              </span>
              <span className="text-[10px] font-bold text-white">{val ?? "—"}</span>
            </div>
            <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: sd.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartTypeBadge({ type, auto = false }: { type: PartType | null; auto?: boolean }) {
  if (!type) {
    return <p className="text-[11px] text-gray-600 italic text-center py-2">Tipo não definido</p>;
  }
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PART_TYPE_IMAGES[type]} alt={PART_TYPE_LABELS[type]} className="w-10 h-10 object-contain" />
      <span className="text-xs font-bold text-gray-300">{PART_TYPE_LABELS[type]}</span>
      {auto && <span className="text-[9px] text-gray-600 uppercase tracking-wide">automático</span>}
    </div>
  );
}

interface EditModalProps {
  part: BeyPart;
  onClose: () => void;
  onSaved: (updated: BeyPart) => void;
}

function EditPartModal({ part, onClose, onSaved }: EditModalProps) {
  const axes = CATEGORY_STATS[part.category];
  const isTypeOnly = TYPE_ONLY_CATEGORIES.includes(part.category);
  const isAutoType = AUTO_TYPE_CATEGORIES.includes(part.category);
  const [imageUrl, setImageUrl] = useState(part.imageUrl ?? "");
  const [partType, setPartType] = useState<string>(part.partType ?? "");
  const [stats, setStats] = useState<Partial<Record<StatKey, string>>>(() =>
    Object.fromEntries(
      axes.map((k) => [k, part[k] != null ? String(part[k]) : ""])
    )
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const preview: BeyPart = {
    ...part,
    imageUrl: imageUrl.trim() || null,
    partType: partType || null,
    ...Object.fromEntries(axes.map((k) => [k, stats[k] !== "" && stats[k] != null ? Number(stats[k]) : null])),
  };
  const previewType = resolvedType(preview);

  async function handleSave() {
    setSaving(true);
    setErr("");
    const body: Record<string, unknown> = {
      imageUrl: imageUrl.trim() || null,
      partType: partType || null,
    };
    for (const k of axes) {
      body[k] = stats[k] !== "" && stats[k] != null ? Number(stats[k]) : null;
    }
    const allKeys: StatKey[] = ["statAttack", "statDefense", "statStamina", "statHeight", "statDash", "statBurst"];
    for (const k of allKeys) {
      if (!axes.includes(k)) body[k] = null;
    }
    const res = await fetch(`/api/admin/beyparts/${part.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      onSaved(await res.json());
    } else {
      setErr("Erro ao salvar");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-0.5">{part.name}</h2>
        <p className="text-sm text-gray-500 mb-4">{CATEGORY_LABELS[part.category]} · {part.line.replace("_", " ")}</p>

        {err && (
          <div className="mb-4 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">{err}</div>
        )}

        {/* Live preview */}
        <div className="flex gap-3 mb-5 p-3 bg-[#252525] rounded-xl border border-[#333]">
          <div className="w-16 h-16 rounded-lg bg-[#111] border border-[#333] flex-shrink-0 overflow-hidden flex items-center justify-center">
            {preview.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.imageUrl} alt={part.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-gray-700 text-[10px] text-center leading-tight px-1">Sem foto</span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {(isTypeOnly || isAutoType) && (
              <PartTypeBadge type={previewType} auto={isAutoType} />
            )}
            {!isTypeOnly && axes.length > 0 && <StatBars part={preview} />}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-400 mb-1">URL da Foto</label>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
          />
        </div>

        {isTypeOnly && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-400 mb-2">Tipo da Peça</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(PART_TYPE_LABELS) as PartType[]).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setPartType(partType === pt ? "" : pt)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                    partType === pt
                      ? "border-[#f0a500] bg-[#f0a500]/10"
                      : "border-[#333] bg-[#252525] hover:border-gray-500"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PART_TYPE_IMAGES[pt]} alt={PART_TYPE_LABELS[pt]} className="w-8 h-8 object-contain" />
                  <span className={`text-[10px] font-semibold ${partType === pt ? "text-[#f0a500]" : "text-gray-400"}`}>
                    {PART_TYPE_LABELS[pt]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isAutoType && axes.length > 0 && (
          <p className="text-[11px] text-gray-500 mb-4 bg-[#252525] px-3 py-2 rounded-lg">
            Tipo detectado automaticamente pelo stat dominante.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {axes.map((key) => {
            const sd = statDef(key);
            return (
              <div key={key}>
                <label className="block text-xs font-bold mb-1" style={{ color: sd.color }}>{sd.label}</label>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={stats[key] ?? ""}
                  onChange={(e) => setStats((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="—"
                  className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                />
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors">
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartCard({ part, onEdit, onDelete, deleting }: {
  part: BeyPart;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const axes = CATEGORY_STATS[part.category];
  const hasStats = axes.some((k) => part[k] != null);
  const showBadge = TYPE_BADGE_CATEGORIES.includes(part.category);
  const isTypeOnly = TYPE_ONLY_CATEGORIES.includes(part.category);
  const partTypeResolved = resolvedType(part);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden flex flex-col">
      {/* Image */}
      <div className="h-32 bg-[#0d0d0d] flex items-center justify-center border-b border-[#222]">
        {part.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={part.imageUrl} alt={part.name} className="h-full w-full object-contain p-2" />
        ) : (
          <span className="text-gray-700 text-xs">Sem foto</span>
        )}
      </div>

      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-1 mb-3">
          <div className="min-w-0">
            <div className="font-bold text-sm text-white leading-tight truncate">{part.name}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{CATEGORY_LABELS[part.category]}</div>
          </div>
          <span className="text-[10px] font-bold bg-[#f0a500]/15 text-[#f0a500] px-1.5 py-0.5 rounded flex-shrink-0">
            {part.line.replace("_", " ")}
          </span>
        </div>

        {showBadge && (
          <div className="flex justify-center mb-2">
            <PartTypeBadge type={partTypeResolved} auto={!isTypeOnly} />
          </div>
        )}

        {!isTypeOnly && (
          <>
            {axes.length >= 3 && (
              <div className="flex justify-center mb-2">
                <RadarChart part={part} size={110} />
              </div>
            )}
            <div className="mb-3">
              {hasStats ? (
                <StatBars part={part} />
              ) : axes.length === 0 ? null : (
                <p className="text-[11px] text-gray-600 italic text-center">Sem stats</p>
              )}
            </div>
          </>
        )}

        <div className="flex gap-2 mt-auto">
          <button onClick={onEdit} className="flex-1 text-xs bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-1.5 rounded-lg transition-colors">
            Editar
          </button>
          <button onClick={onDelete} disabled={deleting} className="flex-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50">
            {deleting ? "..." : "Remover"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BeyPartsManager() {
  const [parts, setParts] = useState<BeyPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLine, setActiveLine] = useState<Line>("BX");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [activeRatchetSize, setActiveRatchetSize] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newNames, setNewNames] = useState<Record<Category, string>>({
    BLADE: "", RATCHET: "", BIT: "", LOCK_CHIP: "", OVER_BLADE: "", MAIN_BLADE: "", ASSIST_BLADE: "",
  });
  const [saving, setSaving] = useState<Category | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<BeyPart | null>(null);

  const fetchParts = useCallback(async () => {
    const res = await fetch("/api/admin/beyparts");
    if (res.ok) setParts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  async function handleAdd(category: Category) {
    const name = newNames[category].trim();
    if (!name) return;
    setSaving(category);
    setError("");
    const res = await fetch("/api/admin/beyparts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line: activeLine, category, name }),
    });
    if (res.ok) {
      setNewNames((prev) => ({ ...prev, [category]: "" }));
      fetchParts();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao adicionar peça");
    }
    setSaving(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    const res = await fetch(`/api/admin/beyparts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setParts((prev) => prev.filter((p) => p.id !== id));
    } else {
      setError("Erro ao remover peça");
    }
    setDeletingId(null);
  }

  function handleSaved(updated: BeyPart) {
    setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingPart(null);
  }

  // Extracts the leading number from a ratchet name, e.g. "3-60" → "3", "4-80" → "4"
  function ratchetSize(name: string): string {
    const m = name.match(/^(\d+)/);
    return m ? m[1] : "?";
  }

  const ratchetSizes: string[] = activeLine === "RATCHET"
    ? [...new Set(
        parts
          .filter((p) => p.line === "RATCHET")
          .map((p) => ratchetSize(p.name))
      )].sort((a, b) => Number(a) - Number(b))
    : [];

  const partsByCategory = (category: Category) =>
    parts
      .filter((p) => p.line === activeLine && p.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const ratchetParts = parts
    .filter((p) => p.line === "RATCHET")
    .filter((p) => activeRatchetSize === null || ratchetSize(p.name) === activeRatchetSize)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white">Catálogo de Peças</h2>
        <p className="text-gray-400 text-sm mt-1">Cadastre as peças disponíveis para cada linha de Beyblade.</p>
      </div>

      {/* Line tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(LINE_LABELS) as Line[]).map((line) => (
          <button
            key={line}
            onClick={() => {
              setActiveLine(line);
              setActiveCategory(null);
              setActiveRatchetSize(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeLine === line ? "bg-[#f0a500] text-black" : "bg-[#252525] text-gray-400 hover:text-white"
            }`}
          >
            {LINE_LABELS[line]}
          </button>
        ))}
      </div>

      {/* Category sub-tabs (only when line has multiple categories) */}
      {LINE_CATEGORIES[activeLine].length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-5 pl-1 border-l-2 border-[#333]">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              activeCategory === null ? "bg-[#333] text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Todas
          </button>
          {LINE_CATEGORIES[activeLine].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeCategory === cat ? "bg-[#333] text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">Carregando...</p>
      ) : activeLine === "RATCHET" ? (
        <div>
          {/* Ratchet size sub-tabs */}
          {ratchetSizes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5 pl-1 border-l-2 border-[#333]">
              <button
                onClick={() => setActiveRatchetSize(null)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  activeRatchetSize === null ? "bg-[#333] text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Todos
              </button>
              {ratchetSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setActiveRatchetSize(size)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    activeRatchetSize === size ? "bg-[#333] text-white" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {size} lâminas
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {ratchetParts.map((p) => (
              <PartCard
                key={p.id}
                part={p}
                onEdit={() => setEditingPart(p)}
                onDelete={() => handleDelete(p.id)}
                deleting={deletingId === p.id}
              />
            ))}
            {/* Add new card */}
            <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-3 flex flex-col justify-between min-h-[80px]">
              <div className="text-xs font-semibold text-gray-500 mb-2">Novo ratchet</div>
              <input
                type="text"
                value={newNames.RATCHET}
                onChange={(e) => setNewNames((prev) => ({ ...prev, RATCHET: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd("RATCHET"); }}
                placeholder="Ex: 3-60"
                className="bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none transition-colors mb-2"
              />
              <button
                onClick={() => handleAdd("RATCHET")}
                disabled={saving === "RATCHET" || !newNames.RATCHET.trim()}
                className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                {saving === "RATCHET" ? "..." : "+ Adicionar"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {LINE_CATEGORIES[activeLine]
            .filter((cat) => activeCategory === null || cat === activeCategory)
            .map((category) => {
            const items = partsByCategory(category);
            return (
              <div key={category}>
                <h3 className="text-sm font-bold text-[#f0a500] mb-3">{CATEGORY_LABELS[category]}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.map((p) => (
                    <PartCard
                      key={p.id}
                      part={p}
                      onEdit={() => setEditingPart(p)}
                      onDelete={() => handleDelete(p.id)}
                      deleting={deletingId === p.id}
                    />
                  ))}

                  {/* Add new card */}
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-3 flex flex-col justify-between min-h-[80px]">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Nova peça</div>
                    <input
                      type="text"
                      value={newNames[category]}
                      onChange={(e) => setNewNames((prev) => ({ ...prev, [category]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(category); }}
                      placeholder="Nome..."
                      className="bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none transition-colors mb-2"
                    />
                    <button
                      onClick={() => handleAdd(category)}
                      disabled={saving === category || !newNames[category].trim()}
                      className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {saving === category ? "..." : "+ Adicionar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingPart && (
        <EditPartModal part={editingPart} onClose={() => setEditingPart(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}
