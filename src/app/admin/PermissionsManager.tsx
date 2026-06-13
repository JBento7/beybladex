"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  canJudge: boolean;
  deleted: boolean;
}

export default function PermissionsManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function toggle(u: User, field: "role" | "canJudge", value: string | boolean) {
    setTogglingId(`${u.id}:${field}`);
    setError("");
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao atualizar permissões");
    }
    setTogglingId(null);
  }

  const active = users.filter((u) => !u.deleted);

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-white">Dashboard de Autorizações</h2>
        <p className="text-gray-400 text-sm mt-1">
          Defina quem pode promover-se a administrador e quem pode alterar placares de
          torneios e BeyEncontros (atuar como juiz).
        </p>
      </div>

      {error && (
        <div className="mb-4 text-red-400 text-sm bg-red-900/20 border border-red-700/30 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-4">Carregando...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-gray-400">
                <th className="text-left py-3 px-2 font-medium">Nome</th>
                <th className="text-left py-3 px-2 font-medium">Email</th>
                <th className="text-left py-3 px-2 font-medium">Administrador</th>
                <th className="text-left py-3 px-2 font-medium">Pode alterar placares</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {active.map((u) => {
                const isAdmin = u.role === "ORGANIZER";
                return (
                  <tr key={u.id} className="hover:bg-[#252525] transition-colors">
                    <td className="py-3 px-2 font-medium text-white">{u.name}</td>
                    <td className="py-3 px-2 text-gray-400">{u.email}</td>
                    <td className="py-3 px-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAdmin}
                          disabled={togglingId === `${u.id}:role`}
                          onChange={(e) => toggle(u, "role", e.target.checked ? "ORGANIZER" : "PARTICIPANT")}
                          className="accent-[#f0a500]"
                        />
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isAdmin ? "bg-[#f0a500]/20 text-[#f0a500]" : "bg-gray-700 text-gray-400"
                        }`}>
                          {isAdmin ? "Admin" : "Jogador"}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 px-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isAdmin || u.canJudge}
                          disabled={isAdmin || togglingId === `${u.id}:canJudge`}
                          onChange={(e) => toggle(u, "canJudge", e.target.checked)}
                          className="accent-[#f0a500]"
                        />
                        <span className="text-xs text-gray-400">
                          {isAdmin ? "Sim (admin)" : u.canJudge ? "Sim" : "Não"}
                        </span>
                      </label>
                    </td>
                  </tr>
                );
              })}
              {active.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-500 text-sm">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
