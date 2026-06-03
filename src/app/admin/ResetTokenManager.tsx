"use client";

import { useEffect, useState } from "react";

interface TokenEntry {
  id: string;
  token: string;
  expiresAt: string;
  user: { name: string; email: string };
}

export default function ResetTokenManager() {
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function fetchTokens() {
    setLoading(true);
    const res = await fetch("/api/admin/reset-tokens");
    if (res.ok) {
      const data = await res.json();
      setTokens(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTokens();
  }, []);

  async function handleClean() {
    setCleaning(true);
    await fetch("/api/admin/reset-tokens", { method: "DELETE" });
    setCleaning(false);
    fetchTokens();
  }

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/reset-password?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div className="mt-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Tokens de Redefinição</h2>
        <button
          onClick={handleClean}
          disabled={cleaning}
          className="text-sm px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          {cleaning ? "Limpando..." : "Limpar expirados"}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-4 text-center">Carregando...</p>
      ) : tokens.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">Nenhum token pendente</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-gray-400">
                <th className="text-left py-3 px-2 font-medium">Usuário</th>
                <th className="text-left py-3 px-2 font-medium">E-mail</th>
                <th className="text-left py-3 px-2 font-medium">Expira em</th>
                <th className="text-left py-3 px-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {tokens.map((t) => (
                <tr key={t.id} className="hover:bg-[#252525] transition-colors">
                  <td className="py-3 px-2 font-medium text-white">{t.user.name}</td>
                  <td className="py-3 px-2 text-gray-400">{t.user.email}</td>
                  <td className="py-3 px-2 text-gray-400">
                    {new Date(t.expiresAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 px-2">
                    <button
                      onClick={() => copyLink(t.token, t.id)}
                      className="text-xs px-3 py-1.5 bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold rounded-lg transition-colors"
                    >
                      {copiedId === t.id ? "Copiado!" : "Copiar Link"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
