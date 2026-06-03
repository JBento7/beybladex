"use client";

import { useState, useEffect, useCallback } from "react";

interface Beyblade {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  wins: number;
  losses: number;
  createdAt: string;
}

const EMPTY = { name: "", blade: "", ratchet: "", bit: "" };

export default function BeybladeManager() {
  const [beyblades, setBeyblades] = useState<Beyblade[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const fetchBeyblades = useCallback(async () => {
    const res = await fetch("/api/beyblades");
    if (res.ok) {
      const data = await res.json();
      setBeyblades(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBeyblades();
  }, [fetchBeyblades]);

  function openCreate() {
    setForm(EMPTY);
    setEditingId(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(b: Beyblade) {
    setForm({
      name: b.name,
      blade: b.blade || "",
      ratchet: b.ratchet || "",
      bit: b.bit || "",
    });
    setEditingId(b.id);
    setError("");
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const url = editingId ? `/api/beyblades/${editingId}` : "/api/beyblades";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      fetchBeyblades();
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao salvar combo");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este combo?")) return;
    await fetch(`/api/beyblades/${id}`, { method: "DELETE" });
    fetchBeyblades();
  }

  function comboParts(b: Beyblade) {
    return [b.blade, b.ratchet, b.bit].filter(Boolean).join(" / ");
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

      {showForm && (
        <form onSubmit={handleSave} className="mb-5 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-3">
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Blade</label>
              <input
                type="text"
                value={form.blade}
                onChange={(e) => setForm({ ...form, blade: e.target.value })}
                placeholder="ex: Dran Sword"
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Ratchet</label>
              <input
                type="text"
                value={form.ratchet}
                onChange={(e) => setForm({ ...form, ratchet: e.target.value })}
                placeholder="ex: 3-60"
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Bit</label>
              <input
                type="text"
                value={form.bit}
                onChange={(e) => setForm({ ...form, bit: e.target.value })}
                placeholder="ex: Flat"
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
              />
            </div>
          </div>
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
      ) : beyblades.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🌀</div>
          <p className="text-gray-500 text-sm">Nenhum combo registrado ainda</p>
          <p className="text-gray-600 text-xs mt-1">Cadastre seus combos (Blade + Ratchet + Bit) para usá-los nos torneios</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {beyblades.map((b) => {
            const total = b.wins + b.losses;
            const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;
            const parts = comboParts(b);
            return (
              <div key={b.id} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{b.name}</div>
                    {parts && <div className="text-xs text-gray-500 mt-0.5 truncate">{parts}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <button
                      onClick={() => openEdit(b)}
                      className="text-gray-600 hover:text-[#f0a500] transition-colors text-xs"
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                      title="Remover"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-black text-green-400">{b.wins}</div>
                    <div className="text-xs text-gray-500">Vitórias</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-red-400">{b.losses}</div>
                    <div className="text-xs text-gray-500">Derrotas</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-[#f0a500]">{winRate}%</div>
                    <div className="text-xs text-gray-500">Taxa V.</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
