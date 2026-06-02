"use client";

import { useState } from "react";

export default function GenerateInviteButton() {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setInviteUrl("");
    const res = await fetch("/api/invites", { method: "POST" });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setInviteUrl(data.url);
    } else {
      alert("Erro ao gerar convite");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="bg-gray-700 hover:bg-gray-600 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? "Gerando..." : "👑 Gerar Link de Convite"}
      </button>
      {inviteUrl && (
        <div className="flex items-center gap-2 bg-gray-800 border border-amber-500/30 rounded-lg px-3 py-2">
          <span className="text-xs text-amber-400 flex-1 truncate">{inviteUrl}</span>
          <button
            onClick={handleCopy}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1 rounded transition-colors flex-shrink-0"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}
