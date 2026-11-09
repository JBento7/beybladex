"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// "Resultado oficial" (docs/RESULTADO-OFICIAL.md): compares the records of the
// event (final, stored 1st place, champion shown) and lets the organization
// correct the podium — reason required, simulation first, one audited
// transaction, removable only by an explicit action.

type Who = { userId: string; name: string } | null;
type Diagnosis = {
  tournament: { name: string; status: string; doubleRankingPoints: boolean; monthClosed: boolean; monthly: { league: string; month: string } | null };
  final: { status: string; isWalkover: boolean; player1: Who; player2: Who; winner: Who; sets: { set: number; p1: number; p2: number; winner: string | null }[]; issues: string[] } | null;
  comparison: { finalWinner: Who; storedFirst: Who; displayedChampion: Who; displayedSource: string; matchesChampion: Who };
  correction: { order: string[]; reason: string; at: string } | null;
  standings: { userId: string; name: string; placement: number | null; rankingPoints: number }[];
  actions: { kind: string; reason: string; createdAt: string }[];
  warnings: string[];
};
type Plan = { changes: { name: string; placementNow: number | null; placementAfter: number; pointsNow: number; pointsAfter: number }[]; unchanged: number; champion: Who };

const SOURCE: Record<string, string> = { admin: "correção oficial da organização", final: "vencedor da final", placement: "classificação final", none: "nenhum (pendente)" };
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function OfficialResultPanel({ tournamentId, participants, onClose }: {
  tournamentId: string;
  participants: { userId: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Diagnosis | null>(null);
  const [order, setOrder] = useState<string[]>(["", "", "", "", ""]);
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<{ key: string; remove: boolean; data: Plan } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/podium`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ tone: "err", text: j.error || "Não foi possível carregar o diagnóstico." }); return; }
    setD(j);
    // Start from the active correction, else from the stored classification.
    // Only the podium (top 3) is pre-filled: anything else keeps following
    // the event's classification unless explicitly chosen.
    const base: string[] = j.correction?.order ?? (j.standings as Diagnosis["standings"]).filter((s) => s.placement != null).slice(0, 3).map((s) => s.userId);
    setOrder([0, 1, 2, 3, 4].map((i) => base[i] ?? ""));
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tournamentId]);

  const filled = order.filter(Boolean);
  const key = (remove: boolean) => JSON.stringify({ remove, order: remove ? null : filled, reason: reason.trim() });
  async function send(remove: boolean, dryRun: boolean) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/podium`, {
        method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: filled, reason, dryRun }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "err", text: j.error || "Erro." }); setPlan(null); return; }
      if (dryRun) { setPlan({ key: key(remove), remove, data: j }); return; }
      setMsg({ tone: "ok", text: `${remove ? "Correção removida" : "Correção aplicada"}: ${j.changes.length} colocação(ões) alterada(s). Campeão: ${j.champion?.name ?? "—"}.` });
      setPlan(null); setReason("");
      await load();
      router.refresh();
    } catch { setMsg({ tone: "err", text: "Sem conexão. Nada foi alterado." }); } finally { setBusy(false); }
  }

  const row = (label: string, w: Who, strong = false) => (
    <tr><td className="pr-3 py-0.5 text-gray-400">{label}</td><td className={strong ? "font-bold text-white" : "text-gray-200"}>{w?.name ?? "—"}</td></tr>
  );
  const canApply = (remove: boolean) => !!plan && plan.key === key(remove) && !busy && !d?.tournament.monthClosed;

  return (
    <section aria-label="Resultado oficial" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="font-bold text-amber-300">Resultado oficial</div>
        <button onClick={onClose} className="ml-auto text-xs text-gray-400 hover:text-white border border-line px-2 py-1 rounded">Fechar</button>
      </div>
      {!d ? <p className="text-xs text-gray-400 mt-2">{msg?.text ?? "Carregando diagnóstico…"}</p> : (
        <>
          <table className="mt-2 text-xs"><tbody>
            {row("Vencedor registrado da final", d.comparison.finalWinner)}
            {row("1º colocado armazenado", d.comparison.storedFirst)}
            {row(`Campeão exibido (${SOURCE[d.comparison.displayedSource] ?? d.comparison.displayedSource})`, d.comparison.displayedChampion, true)}
          </tbody></table>
          {d.final && (
            <p className="mt-2 text-xs text-gray-300">
              Final: <b>{d.final.player1?.name}</b> × <b>{d.final.player2?.name}</b> · {d.final.status === "FINISHED" ? "encerrada" : "não concluída"}
              {d.final.isWalkover ? " · W.O." : ""}{d.final.sets.length ? ` · sets: ${d.final.sets.map((s) => `${s.p1}–${s.p2}`).join(", ")}` : ""}
            </p>
          )}
          {d.correction && (
            <p className="mt-2 text-xs text-amber-200">Correção oficial ativa desde {fmt(d.correction.at)} — motivo: “{d.correction.reason}”. Recálculos automáticos a respeitam; os registros das partidas são preservados.</p>
          )}
          {d.warnings.map((w) => <p key={w} role="alert" className="mt-1 text-xs text-red-300">⚠ {w}</p>)}
          {d.tournament.doubleRankingPoints && <p className="mt-1 text-xs text-gray-400">Pontuação dobrada: os pontos usam a tabela congelada do torneio × 2, sem somar de novo.</p>}

          <div className="mt-3 space-y-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <label key={i} className="flex items-center gap-2 text-xs">
                <span className="w-8 font-black text-amber-300">{i + 1}º</span>
                <select value={order[i]} onChange={(e) => { setOrder((o) => o.map((v, j) => (j === i ? e.target.value : v))); setPlan(null); }}
                  className="flex-1 min-w-0 min-h-[36px] bg-card border border-line rounded px-2 text-white">
                  <option value="">— manter pela classificação —</option>
                  {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                </select>
              </label>
            ))}
            <p className="text-[11px] text-gray-400">Quem não for escolhido mantém a ordem da classificação do torneio, abaixo das posições corrigidas, com os pontos da regra do torneio.</p>
            <label className="block text-xs text-gray-300">Motivo (obrigatório)
              <textarea value={reason} onChange={(e) => { setReason(e.target.value); setPlan(null); }} rows={2} maxLength={500}
                placeholder="ex.: Organização confirmou que Dominic venceu a final" className="mt-1 w-full bg-card border border-line rounded px-2 py-1 text-white" />
            </label>
          </div>

          {plan && (
            <div className="mt-3 rounded border border-line bg-card p-2 text-xs">
              <div className="font-bold text-white mb-1">Simulação ({plan.remove ? "remover correção" : "aplicar correção"}) — campeão: {plan.data.champion?.name ?? "—"}</div>
              {plan.data.changes.length === 0 ? <p className="text-gray-400">Nenhuma colocação ou pontuação muda.</p> : (
                <table className="w-full"><thead><tr className="text-gray-400"><th className="text-left">Jogador</th><th>Colocação</th><th>Pontos de ranking</th></tr></thead>
                  <tbody>{plan.data.changes.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td className="text-center">{c.placementNow ?? "—"} → <b>{c.placementAfter}</b></td><td className="text-center">{c.pointsNow} → <b>{c.pointsAfter}</b></td></tr>
                  ))}</tbody></table>
              )}
              <p className="mt-1 text-gray-400">{plan.data.unchanged} participante(s) sem alteração.</p>
            </div>
          )}
          {msg && <p role="status" className={`mt-2 text-xs ${msg.tone === "ok" ? "text-green-300" : "text-red-300"}`}>{msg.text}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={busy || !reason.trim() || filled.length === 0} onClick={() => send(false, true)} className="text-xs font-bold border border-amber-400/60 text-amber-200 px-3 py-1.5 rounded disabled:opacity-40">Simular correção</button>
            <button disabled={!canApply(false) || plan?.remove} onClick={() => send(false, false)} className="text-xs font-bold bg-amber-400 text-black px-3 py-1.5 rounded disabled:opacity-40">Aplicar correção</button>
            {d.correction && <>
              <button disabled={busy || !reason.trim()} onClick={() => send(true, true)} className="text-xs font-bold border border-line text-gray-200 px-3 py-1.5 rounded disabled:opacity-40">Simular remoção</button>
              <button disabled={!canApply(true) || !plan?.remove} onClick={() => send(true, false)} className="text-xs font-bold border border-red-500/60 text-red-300 px-3 py-1.5 rounded disabled:opacity-40">Remover correção</button>
            </>}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">Simule antes de aplicar. A aplicação é uma transação única, registrada com o administrador, a data e os valores anteriores e posteriores; repetir a mesma correção não altera nada. Com o ranking mensal encerrado, nada é alterado.</p>
          {d.actions.length > 0 && (
            <details className="mt-2 text-xs text-gray-400"><summary className="cursor-pointer">Histórico administrativo</summary>
              <ul className="mt-1 space-y-0.5">{d.actions.map((a, i) => <li key={i}>{fmt(a.createdAt)} · {a.kind} · {a.reason}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
