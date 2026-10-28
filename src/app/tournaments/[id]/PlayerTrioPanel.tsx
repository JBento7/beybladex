"use client";

import { useCallback, useEffect, useState } from "react";
import TrioPicker from "@/components/deck/TrioPicker";
import type { DeckBey } from "@/lib/deckFormat";

type PlayerView = { userId: string; confirmed: boolean; revision: number; active: string[] | null; reserveId: string | null; registered: DeckBey[]; previousTrio: string[] | null };
type View = { locked: boolean; bothConfirmed: boolean; bye: boolean; official: boolean; status: string; players: PlayerView[] };

// 3on3 + 1 reserva, on the player's own device: choose the 3 active
// Beyblades for THIS match (revisable until the match starts), see whether
// the opponent already confirmed (their trio is revealed only when both did).
// The choice lives on the server: it survives reloads and device changes.
export default function PlayerTrioPanel({ matchId, userId, color = "#f0a500" }: { matchId: string; userId: string; color?: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/matches/${matchId}/trio`, { cache: "no-store" });
      if (r.ok) setView(await r.json());
    } catch { /* offline: keep the last view */ }
  }, [matchId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [open, load]);

  if (!view || view.bye) return null;
  const me = view.players.find((p) => p.userId === userId);
  const opp = view.players.find((p) => p.userId !== userId);
  if (!me) return null;
  const nameOf = (id: string | null) => me.registered.find((b) => b.id === id)?.name ?? "—";

  async function confirm(ids: string[]) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/matches/${matchId}/trio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, beybladeIds: ids }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: d.error || "Não foi possível confirmar o trio." });
      else { setMsg({ ok: true, text: "Trio confirmado. Você pode revisar até o início do confronto." }); setEditing(false); }
      await load();
    } catch {
      setMsg({ ok: false, text: "Sem conexão. Sua escolha não foi enviada — tente de novo." });
    } finally { setBusy(false); }
  }

  const label = view.locked ? "Trio bloqueado" : me.confirmed ? "Trio confirmado · revisar" : "Escolher trio para esta partida";
  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setMsg(null); setEditing(!me.confirmed); }}
        className={`text-xs font-bold px-3 py-2 min-h-[36px] rounded-lg transition-colors ${me.confirmed ? "bg-field border border-line text-gray-100" : "bg-brand-yellow hover:bg-brand-yellow-hover text-black"}`}
      >
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Trio desta partida" className="relative bg-card border border-line rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">Trio desta partida</h3>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="text-gray-400 hover:text-white text-2xl leading-none p-2 -m-2">✕</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">3 Beyblades ativas neste confronto; a 4ª fica como reserva. Nos próximos confrontos você pode escolher outro trio.</p>
            {msg && <p role="status" className={`mb-3 text-sm ${msg.ok ? "text-green-300" : "text-red-300"}`}>{msg.text}</p>}

            {view.locked ? (
              <div className="rounded-xl bg-field border border-line p-3 text-sm text-gray-100">
                <p className="font-bold text-white mb-1">🔒 Confronto iniciado — trio bloqueado</p>
                <p>Ativas: {me.active?.map(nameOf).join(", ")}</p>
                <p>Reserva: {nameOf(me.reserveId)}</p>
              </div>
            ) : me.confirmed && !editing ? (
              <div className="rounded-xl bg-field border border-line p-3 text-sm text-gray-100">
                <p className="font-bold text-green-300 mb-1">✓ Trio confirmado (revisão {me.revision})</p>
                <p>Ativas: {me.active?.map(nameOf).join(", ")}</p>
                <p>Reserva nesta partida: <strong>{nameOf(me.reserveId)}</strong></p>
                <button type="button" onClick={() => setEditing(true)} className="mt-3 w-full min-h-11 rounded-lg border border-line text-white font-semibold">Revisar trio</button>
              </div>
            ) : (
              <TrioPicker registered={me.registered} initial={me.active} previous={me.previousTrio} official={view.official} color={color} busy={busy} onConfirm={confirm} />
            )}

            <div className="mt-4 rounded-xl border border-line p-3 text-sm">
              <p className="text-gray-300">Adversário: {opp?.confirmed ? <span className="text-green-300 font-semibold">trio confirmado</span> : <span className="text-amber-300">aguardando</span>}</p>
              {opp?.active ? (
                <p className="text-xs text-gray-400 mt-1">Os dois confirmaram — a formação do adversário fica visível para o juiz e para você.</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">A escolha do adversário só aparece depois que os dois confirmarem.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
