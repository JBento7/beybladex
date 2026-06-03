"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  deleted: boolean;
  createdAt: string;
  _count: { participations: number; beyblades: number };
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "PARTICIPANT" };

export default function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(u: User) {
    setForm({ name: u.name, email: u.email, password: "", role: u.role });
    setEditingId(u.id);
    setError("");
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const url = editingId ? `/api/admin/users/${editingId}` : "/api/admin/users";
    const method = editingId ? "PATCH" : "POST";
    const body: Record<string, string> = {
      name: form.name,
      email: form.email,
      role: form.role,
    };
    if (form.password) body.password = form.password;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || "Erro ao salvar usuário");
    }
  }

  async function handleDelete(u: User) {
    if (
      !confirm(
        `Deletar "${u.name}"?\n\nO histórico de partidas será mantido de forma anonimizada. Esta ação não pode ser desfeita.`
      )
    )
      return;
    await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    fetchUsers();
  }

  const active = users.filter((u) => !u.deleted);
  const deleted = users.filter((u) => u.deleted);

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-white">Gerenciar Usuários</h2>
        <button
          onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}
          className="bg-[#c8102e] hover:bg-[#a00d24] text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {showForm && !editingId ? "Cancelar" : "+ Novo Usuário"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-6 bg-[#252525] border border-[#333] rounded-xl p-4 space-y-3"
        >
          <h3 className="text-sm font-bold text-white mb-1">
            {editingId ? "Editar Usuário" : "Criar Novo Usuário"}
          </h3>
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Nome <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Nome completo"
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="email@exemplo.com"
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Senha {editingId && <span className="text-gray-500 font-normal">(deixe vazio para manter)</span>}
                {!editingId && <span className="text-red-400">*</span>}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingId}
                placeholder={editingId ? "Nova senha (opcional)" : "Senha"}
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Papel</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full bg-[#1a1a1a] border border-[#333] focus:border-[#f0a500] rounded-lg px-3 py-2 text-white outline-none text-sm"
              >
                <option value="PARTICIPANT">Jogador</option>
                <option value="ORGANIZER">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              {saving ? "Salvando..." : editingId ? "Salvar" : "Criar Usuário"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="bg-[#333] hover:bg-[#444] text-gray-300 font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">Carregando...</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-gray-400">
                  <th className="text-left py-3 px-2 font-medium">Nome</th>
                  <th className="text-left py-3 px-2 font-medium">Email</th>
                  <th className="text-left py-3 px-2 font-medium">Papel</th>
                  <th className="text-left py-3 px-2 font-medium">Torneios</th>
                  <th className="text-left py-3 px-2 font-medium">Combos</th>
                  <th className="text-left py-3 px-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a]">
                {active.map((u) => (
                  <tr key={u.id} className="hover:bg-[#252525] transition-colors">
                    <td className="py-3 px-2 font-medium text-white">{u.name}</td>
                    <td className="py-3 px-2 text-gray-400">{u.email}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          u.role === "ORGANIZER"
                            ? "bg-[#f0a500]/20 text-[#f0a500]"
                            : "bg-gray-700 text-gray-400"
                        }`}
                      >
                        {u.role === "ORGANIZER" ? "Admin" : "Jogador"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-400">{u._count.participations}</td>
                    <td className="py-3 px-2 text-gray-400">{u._count.beyblades}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-[#f0a500] hover:text-amber-300 transition-colors text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="text-red-500 hover:text-red-400 transition-colors text-xs font-medium"
                        >
                          Deletar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {active.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500 text-sm">
                      Nenhum usuário encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {deleted.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">
                {deleted.length} usuário{deleted.length > 1 ? "s" : ""} removido{deleted.length > 1 ? "s" : ""} (histórico anonimizado)
              </summary>
              <div className="mt-2 space-y-1">
                {deleted.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-1.5 px-2 bg-[#252525] rounded text-xs text-gray-600">
                    <span>{u.id}</span>
                    <span>·</span>
                    <span>{u._count.participations} torneios preservados</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
