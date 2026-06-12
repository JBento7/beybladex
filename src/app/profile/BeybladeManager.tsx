"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Beyblade {
  id: string;
  name: string;
  blade: string | null;
  ratchet: string | null;
  bit: string | null;
  wins: number;
  losses: number;
  points: number;
  hiddenFromCommunity: boolean;
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
  const [success, setSuccess] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState(false);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(""), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

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
      flashSuccess("Combo salvo!");
      fetchBeyblades();
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao salvar combo");
    }
  }

  async function handleResetStats(id: string) {
    setResettingId(id);
    setError("");
    try {
      const res = await fetch(`/api/beyblades/${id}/reset-stats`, { method: "POST" });
      if (res.ok) {
        setConfirmResetId(null);
        flashSuccess("Estatísticas zeradas!");
        fetchBeyblades();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao zerar estatísticas. Tente novamente.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
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
        setDeleteError("Erro ao remover combo. Tente novamente.");
        return;
      }
      setConfirmingId(null);
      flashSuccess("Combo removido!");
      await fetchBeyblades();
    } catch {
      setDeleteError("Erro ao remover combo. Tente novamente.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleHidden(b: Beyblade) {
    setTogglingId(b.id);
    setError("");
    try {
      const res = await fetch(`/api/beyblades/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenFromCommunity: !b.hiddenFromCommunity }),
      });
      if (res.ok) {
        flashSuccess(!b.hiddenFromCommunity ? "Combo trancado!" : "Combo destrancado!");
        fetchBeyblades();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao atualizar combo. Tente novamente.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setTogglingId(null);
    }
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
                    <div className="font-bold text-white truncate flex items-center gap-1.5">
                      {b.name}
                      {b.hiddenFromCommunity && (
                        <span className="text-[10px] bg-[#f0a500]/20 text-[#f0a500] border border-[#f0a500]/30 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                          🔒 Trancado
                        </span>
                      )}
                    </div>
                    {parts && <div className="text-xs text-gray-500 mt-0.5 truncate">{parts}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {confirmingId === b.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        {deletingId === b.id ? (
                          <span className="text-gray-400">Removendo...</span>
                        ) : (
                          <>
                            <span className="text-gray-400">Remover?</span>
                            <button
                              onClick={() => handleDelete(b.id)}
                              className="text-red-400 hover:text-red-300 font-semibold transition-colors"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setConfirmingId(null)}
                              className="text-gray-400 hover:text-gray-200 font-semibold transition-colors"
                            >
                              Não
                            </button>
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
                          disabled={deletingId === b.id || togglingId === b.id}
                          aria-label={b.hiddenFromCommunity ? "Destrancar combo" : "Trancar combo"}
                          className={`disabled:opacity-50 transition-colors text-xs ${
                            b.hiddenFromCommunity ? "text-[#f0a500] hover:text-[#d4940a]" : "text-gray-600 hover:text-[#f0a500]"
                          }`}
                          title={b.hiddenFromCommunity ? "Destrancar (visível na comunidade)" : "Trancar (ocultar da comunidade)"}
                        >
                          {b.hiddenFromCommunity ? "🔒" : "🔓"}
                        </button>
                        <button
                          onClick={() => openEdit(b)}
                          disabled={deletingId === b.id}
                          aria-label="Editar combo"
                          className="text-gray-600 hover:text-[#f0a500] disabled:opacity-50 transition-colors text-xs"
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => { setDeleteError(""); setConfirmingId(b.id); }}
                          disabled={deletingId === b.id}
                          aria-label="Remover combo"
                          className="text-gray-600 hover:text-red-400 disabled:opacity-50 transition-colors text-xs"
                          title="Remover"
                        >
                          ✕
                        </button>
                        <button
                          onClick={() => { setConfirmResetId(b.id); }}
                          disabled={deletingId === b.id}
                          aria-label="Zerar estatísticas"
                          className="text-gray-600 hover:text-amber-400 disabled:opacity-50 transition-colors text-xs"
                          title="Zerar estatísticas"
                        >
                          ↺
                        </button>
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
      )}
    </div>
  );
}
