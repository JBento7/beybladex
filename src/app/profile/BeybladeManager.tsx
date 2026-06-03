"use client";

import { useState, useEffect, useCallback } from "react";

interface Beyblade {
  id: string;
  name: string;
  model: string | null;
  wins: number;
  losses: number;
  createdAt: string;
}

export default function BeybladeManager() {
  const [beyblades, setBeyblades] = useState<Beyblade[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [adding, setAdding] = useState(false);
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    const res = await fetch("/api/beyblades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model: model || undefined }),
    });
    setAdding(false);
    if (res.ok) {
      setName("");
      setModel("");
      setShowForm(false);
      fetchBeyblades();
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao adicionar beyblade");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover esta beyblade?")) return;
    await fetch(`/api/beyblades/${id}`, { method: "DELETE" });
    fetchBeyblades();
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Minhas Beyblades</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Cancelar" : "+ Adicionar Beyblade"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-5 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-3">
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Nome <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="ex: Dran Sword"
              className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Modelo <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ex: Attack Type"
              className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-lg transition-colors"
          >
            {adding ? "Adicionando..." : "Adicionar"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-4 text-center">Carregando...</div>
      ) : beyblades.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🌀</div>
          <p className="text-gray-500 text-sm">Nenhuma beyblade registrada ainda</p>
          <p className="text-gray-600 text-xs mt-1">Adicione suas beyblades para acompanhar as estatísticas</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {beyblades.map((b) => {
            const total = b.wins + b.losses;
            const winRate = total > 0 ? Math.round((b.wins / total) * 100) : 0;
            return (
              <div key={b.id} className="bg-[#252525] border border-[#333] rounded-xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-white">{b.name}</div>
                    {b.model && <div className="text-xs text-gray-500 mt-0.5">{b.model}</div>}
                  </div>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs"
                    title="Remover"
                  >
                    ✕
                  </button>
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
