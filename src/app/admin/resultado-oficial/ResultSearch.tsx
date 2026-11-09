"use client";

import { useState } from "react";
import Link from "next/link";

type Who = { userId: string; name: string } | null;
type Row = { id: string; name: string; date: string; community: string; isOfficial: boolean; final: { player1: Who; player2: Who; winner: Who; status: string } | null; storedFirst: Who; champion: Who; source: string; matchingPlayers: { userId: string; name: string }[] };
const SOURCE: Record<string, string> = { admin: "correção oficial", final: "final", placement: "classificação", none: "pendente" };

export default function ResultSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/official-result/find?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j.error || "Erro na busca."); setRows(null); } else setRows(j.tournaments);
    } catch { setErr("Sem conexão."); } finally { setBusy(false); }
  }
  return (
    <div>
      <form onSubmit={search} className="flex gap-2 mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou apelido do jogador (ex.: Dominic)" aria-label="Jogador"
          className="flex-1 min-h-[44px] bg-field border border-line rounded-lg px-3 text-white" />
        <button disabled={busy || q.trim().length < 2} className="min-h-[44px] px-4 rounded-lg bg-brand-yellow text-black font-bold disabled:opacity-50">{busy ? "Buscando…" : "Buscar"}</button>
      </form>
      {err && <p role="alert" className="text-sm text-red-300 mb-3">{err}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-400">Nenhum torneio encerrado encontrado.</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const conflict = (r.final?.winner && r.storedFirst && r.final.winner.userId !== r.storedFirst.userId) || r.source === "none";
            return (
              <li key={r.id} className={`rounded-xl border p-3 text-sm ${conflict ? "border-red-500/50 bg-red-500/5" : "border-line bg-card"}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-white">{r.name}</b>
                  <span className="text-xs text-gray-400">{new Date(r.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {r.community.toUpperCase()}{r.isOfficial ? "" : " · BeyEncontro"}</span>
                  <Link href={`/tournaments/${r.id}?aba=partidas`} className="ml-auto text-xs font-bold text-brand-yellow underline">Abrir torneio →</Link>
                </div>
                <div className="mt-1 grid gap-0.5 text-xs text-gray-300 sm:grid-cols-2">
                  <span>Final: {r.final ? `${r.final.player1?.name} × ${r.final.player2?.name}` : "sem mata-mata"}</span>
                  <span>Vencedor registrado da final: <b>{r.final?.winner?.name ?? "—"}</b></span>
                  <span>1º colocado armazenado: <b>{r.storedFirst?.name ?? "—"}</b></span>
                  <span>Campeão exibido: <b>{r.champion?.name ?? "—"}</b> ({SOURCE[r.source] ?? r.source})</span>
                  <span className="sm:col-span-2 text-gray-500">Jogadores encontrados: {r.matchingPlayers.map((p) => `${p.name} (id ${p.userId.slice(0, 8)}…)`).join(", ")}</span>
                </div>
                {conflict && <p className="mt-1 text-xs text-red-300">⚠ Registros divergentes neste torneio.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
