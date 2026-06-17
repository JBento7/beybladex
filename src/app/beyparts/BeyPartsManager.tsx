"use client";

import { useState, useEffect, useCallback } from "react";

type Line = "BX" | "UX" | "CX";
type Category = "BLADE" | "RATCHET" | "BIT" | "LOCK_CHIP" | "MAIN_BLADE" | "ASSIST_BLADE";

interface BeyPart {
  id: string;
  line: Line;
  category: Category;
  name: string;
  imageUrl: string | null;
  statAtk: number | null;
  statDef: number | null;
  statSta: number | null;
  statBr: number | null;
  statXdash: number | null;
  statBal: number | null;
}

const LINE_LABELS: Record<Line, string> = { BX: "BX", UX: "UX", CX: "CX" };

const CATEGORY_LABELS: Record<Category, string> = {
  BLADE: "Blade",
  RATCHET: "Ratchet",
  BIT: "Bit",
  LOCK_CHIP: "Lock Chip",
  MAIN_BLADE: "Metal Blade",
  ASSIST_BLADE: "Assist Blade",
};

const LINE_CATEGORIES: Record<Line, Category[]> = {
  BX: ["BLADE", "RATCHET", "BIT"],
  UX: ["BLADE", "RATCHET", "BIT"],
  CX: ["LOCK_CHIP", "MAIN_BLADE", "ASSIST_BLADE", "RATCHET", "BIT"],
};

const STAT_KEYS = ["statAtk", "statDef", "statSta", "statBal", "statXdash", "statBr"] as const;
const STAT_LABELS = ["ATK", "DEF", "STA", "BAL", "X-DASH", "BR"];
const MAX_STAT = 130;

function RadarChart({ part, size = 140 }: { part: BeyPart; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const labelR = size * 0.49;

  const angles = STAT_KEYS.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 6);

  const vals = STAT_KEYS.map((k) => part[k] ?? 0);
  const hasData = vals.some((v) => v > 0);

  // Background hex lines (grid rings)
  const rings = [0.25, 0.5, 0.75, 1];
  const hexPath = (fraction: number) => {
    const pts = angles.map((a) => {
      const rr = r * fraction;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    });
    return `M${pts.join("L")}Z`;
  };

  // Data polygon
  const dataPath = () => {
    const pts = vals.map((v, i) => {
      const fraction = Math.min(v / MAX_STAT, 1);
      return `${cx + Math.cos(angles[i]) * r * fraction},${cy + Math.sin(angles[i]) * r * fraction}`;
    });
    return `M${pts.join("L")}Z`;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {rings.map((frac) => (
        <path key={frac} d={hexPath(frac)} fill="none" stroke="#333" strokeWidth="0.8" />
      ))}
      {/* Axis lines */}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(a) * r}
          y2={cy + Math.sin(a) * r}
          stroke="#444"
          strokeWidth="0.8"
        />
      ))}
      {/* Data fill */}
      {hasData && (
        <>
          <path d={dataPath()} fill="#f0a500" fillOpacity="0.25" stroke="#f0a500" strokeWidth="1.5" />
        </>
      )}
      {/* Axis labels */}
      {angles.map((a, i) => {
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#aaa"
            fontSize="8"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {STAT_LABELS[i]}
          </text>
        );
      })}
    </svg>
  );
}

interface EditModalProps {
  part: BeyPart;
  onClose: () => void;
  onSaved: (updated: BeyPart) => void;
}

function EditPartModal({ part, onClose, onSaved }: EditModalProps) {
  const [imageUrl, setImageUrl] = useState(part.imageUrl ?? "");
  const [stats, setStats] = useState<Record<string, string>>({
    statAtk: part.statAtk != null ? String(part.statAtk) : "",
    statDef: part.statDef != null ? String(part.statDef) : "",
    statSta: part.statSta != null ? String(part.statSta) : "",
    statBr: part.statBr != null ? String(part.statBr) : "",
    statXdash: part.statXdash != null ? String(part.statXdash) : "",
    statBal: part.statBal != null ? String(part.statBal) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const preview: BeyPart = {
    ...part,
    imageUrl: imageUrl.trim() || null,
    statAtk: stats.statAtk !== "" ? Number(stats.statAtk) : null,
    statDef: stats.statDef !== "" ? Number(stats.statDef) : null,
    statSta: stats.statSta !== "" ? Number(stats.statSta) : null,
    statBr: stats.statBr !== "" ? Number(stats.statBr) : null,
    statXdash: stats.statXdash !== "" ? Number(stats.statXdash) : null,
    statBal: stats.statBal !== "" ? Number(stats.statBal) : null,
  };

  async function handleSave() {
    setSaving(true);
    setErr("");
    const body = {
      imageUrl: imageUrl.trim() || null,
      statAtk: stats.statAtk !== "" ? Number(stats.statAtk) : null,
      statDef: stats.statDef !== "" ? Number(stats.statDef) : null,
      statSta: stats.statSta !== "" ? Number(stats.statSta) : null,
      statBr: stats.statBr !== "" ? Number(stats.statBr) : null,
      statXdash: stats.statXdash !== "" ? Number(stats.statXdash) : null,
      statBal: stats.statBal !== "" ? Number(stats.statBal) : null,
    };
    const res = await fetch(`/api/admin/beyparts/${part.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      onSaved(updated);
    } else {
      setErr("Erro ao salvar");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold text-white mb-1">{part.name}</h2>
        <p className="text-sm text-gray-500 mb-4">{CATEGORY_LABELS[part.category]} · {part.line}</p>

        {err && (
          <div className="mb-4 text-sm px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
            {err}
          </div>
        )}

        {/* Preview card */}
        <div className="flex gap-4 mb-6 p-4 bg-[#252525] rounded-xl border border-[#333]">
          <div className="w-20 h-20 rounded-lg bg-[#111] border border-[#333] flex-shrink-0 overflow-hidden flex items-center justify-center">
            {preview.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.imageUrl} alt={part.name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-gray-600 text-xs text-center">Sem foto</span>
            )}
          </div>
          <RadarChart part={preview} size={80} />
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

        <div className="grid grid-cols-2 gap-3 mb-6">
          {STAT_KEYS.map((key, i) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-400 mb-1">{STAT_LABELS[i]} (0–130)</label>
              <input
                type="number"
                min="0"
                max="130"
                value={stats[key]}
                onChange={(e) => setStats((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="—"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-2.5 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl transition-colors"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PartCard({
  part,
  onEdit,
  onDelete,
  deleting,
}: {
  part: BeyPart;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const hasStats = STAT_KEYS.some((k) => part[k] != null);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden">
      {/* Image */}
      <div className="h-36 bg-[#111] flex items-center justify-center border-b border-[#222]">
        {part.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={part.imageUrl} alt={part.name} className="h-full w-full object-contain p-2" />
        ) : (
          <span className="text-gray-700 text-xs">Sem foto</span>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="font-bold text-sm text-white leading-tight">{part.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{CATEGORY_LABELS[part.category]}</div>
          </div>
          <span className="text-xs font-bold bg-[#f0a500]/15 text-[#f0a500] px-2 py-0.5 rounded flex-shrink-0">
            {part.line}
          </span>
        </div>

        {/* Radar chart */}
        <div className="flex justify-center my-2">
          <RadarChart part={part} size={120} />
        </div>

        {/* Stats grid */}
        {hasStats && (
          <div className="grid grid-cols-3 gap-1 mb-3">
            {STAT_KEYS.map((k, i) => (
              <div key={k} className="text-center">
                <div className="text-[10px] text-gray-500 font-semibold">{STAT_LABELS[i]}</div>
                <div className="text-xs font-bold text-white">{part[k] ?? "—"}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 text-xs bg-[#252525] hover:bg-[#333] text-gray-300 font-semibold py-1.5 rounded-lg transition-colors"
          >
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="flex-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
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
  const [error, setError] = useState("");
  const [newNames, setNewNames] = useState<Record<Category, string>>({
    BLADE: "", RATCHET: "", BIT: "", LOCK_CHIP: "", MAIN_BLADE: "", ASSIST_BLADE: "",
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

  const partsByCategory = (category: Category) =>
    parts.filter((p) => p.line === activeLine && p.category === category);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white">Catálogo de Peças</h2>
        <p className="text-gray-400 text-sm mt-1">
          Cadastre as peças disponíveis para cada linha de Beyblade.
        </p>
      </div>

      {/* Line tabs */}
      <div className="flex gap-2 mb-5">
        {(Object.keys(LINE_LABELS) as Line[]).map((line) => (
          <button
            key={line}
            onClick={() => setActiveLine(line)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeLine === line
                ? "bg-[#f0a500] text-black"
                : "bg-[#252525] text-gray-400 hover:text-white"
            }`}
          >
            Linha {LINE_LABELS[line]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">Carregando...</p>
      ) : (
        <div className="space-y-8">
          {LINE_CATEGORIES[activeLine].map((category) => {
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
                  <div className="bg-[#111] border border-dashed border-[#333] rounded-xl p-3 flex flex-col">
                    <div className="text-xs font-semibold text-gray-500 mb-2">Nova peça</div>
                    <input
                      type="text"
                      value={newNames[category]}
                      onChange={(e) => setNewNames((prev) => ({ ...prev, [category]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(category); }}
                      placeholder={`Nome...`}
                      className="flex-1 bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 outline-none transition-colors mb-2"
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
        <EditPartModal
          part={editingPart}
          onClose={() => setEditingPart(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
