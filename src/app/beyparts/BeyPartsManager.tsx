"use client";

import { useState, useEffect, useCallback } from "react";

type Line = "BX" | "UX" | "CX";
type Category = "BLADE" | "RATCHET" | "BIT" | "LOCK_CHIP" | "MAIN_BLADE" | "ASSIST_BLADE";

interface BeyPart {
  id: string;
  line: Line;
  category: Category;
  name: string;
}

const LINE_LABELS: Record<Line, string> = {
  BX: "BX",
  UX: "UX",
  CX: "CX",
};

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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {LINE_CATEGORIES[activeLine].map((category) => {
            const items = partsByCategory(category);
            return (
              <div key={category} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                <h3 className="text-sm font-bold text-[#f0a500] mb-3">{CATEGORY_LABELS[category]}</h3>

                <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
                  {items.length === 0 ? (
                    <p className="text-gray-500 text-xs">Nenhuma peça cadastrada</p>
                  ) : (
                    items.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5">
                        <span className="text-sm text-gray-200 truncate">{p.name}</span>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-50 text-xs font-semibold flex-shrink-0"
                        >
                          remover
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); handleAdd(category); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newNames[category]}
                    onChange={(e) => setNewNames((prev) => ({ ...prev, [category]: e.target.value }))}
                    placeholder={`Novo ${CATEGORY_LABELS[category].toLowerCase()}`}
                    className="flex-1 bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={saving === category || !newNames[category].trim()}
                    className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-50 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors"
                  >
                    +
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
