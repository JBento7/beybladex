"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MatchRow {
  id: string;
  round: number;
  player1Name: string;
  player2Name: string;
  status: string;
  isWalkover: boolean;
  p1Sets: number;
  p2Sets: number;
  p1Points: number;
  p2Points: number;
  winnerId: string | null;
  player1Id: string;
  player2Id: string;
  sets: { p1Points: number; p2Points: number }[];
}

type EditSet = { p1: number; p2: number };

export default function AdminMatchEditor({
  matches,
  tournamentId,
  participants = [],
}: {
  matches: MatchRow[];
  tournamentId: string;
  participants?: { userId: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  // Inline score editing (does not reset, does not transmit to arenas).
  const [editId, setEditId] = useState<string | null>(null);
  const [editSets, setEditSets] = useState<EditSet[]>([]);
  const [savingScore, setSavingScore] = useState(false);

  // Force round advancement (unstick a round whose next round wasn't generated).
  const [advancing, setAdvancing] = useState(false);
  const [advanceMsg, setAdvanceMsg] = useState<string | null>(null);

  const [deduping, setDeduping] = useState(false);
  const [recalcing, setRecalcing] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [rankingBusy, setRankingBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);

  async function cloneAsTest() {
    setCloneBusy(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/clone-as-test`, { method: "POST" });
    setCloneBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAdvanceMsg(`Cópia de teste criada: "${data.name}" · ${data.participants} jogadores · ${data.arenas} arena(s). Abrindo...`);
      router.push(`/tournaments/${data.id}`);
    } else {
      setAdvanceMsg(data.error || "Erro ao duplicar torneio");
    }
  }

  // Manual podium override (when the recorded matches don't reflect reality).
  const PODIUM_PTS = [100, 70, 50, 30, 10];
  const [podiumOpen, setPodiumOpen] = useState(false);
  const [podium, setPodium] = useState<string[]>(["", "", "", "", ""]);
  const [podiumBusy, setPodiumBusy] = useState(false);

  async function savePodium() {
    const order = podium.filter(Boolean);
    if (!order.length) { setAdvanceMsg("Escolha ao menos o 1º colocado."); return; }
    if (new Set(order).size !== order.length) { setAdvanceMsg("O mesmo jogador está em duas posições."); return; }
    setPodiumBusy(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/podium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    setPodiumBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const p = (data.podium ?? []) as { placement: number; name: string; rankingPoints: number }[];
      setAdvanceMsg("Pódio definido: " + p.map((x) => `${x.placement}º ${x.name} (${x.rankingPoints}pts)`).join(" · "));
      setPodiumOpen(false);
      router.refresh();
    } else {
      setAdvanceMsg(data.error || "Erro ao definir pódio");
    }
  }
  const [health, setHealth] = useState<
    { code: string; severity: string; count: number; detail: string; action: string }[] | null
  >(null);

  async function runHealth(fix: boolean) {
    setHealthBusy(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fix }),
    });
    setHealthBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setHealth(data.issues ?? []);
      if (data.healthy) setAdvanceMsg("✅ Nenhum problema encontrado neste torneio.");
      else if (fix && (data.repaired ?? []).length) setAdvanceMsg("Reparos aplicados: " + data.repaired.join(" · "));
      router.refresh();
    } else {
      setAdvanceMsg(data.error || "Erro no diagnóstico");
    }
  }

  async function recalcRanking() {
    setRankingBusy(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/recalc-ranking`, { method: "POST" });
    setRankingBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const top = (data.top ?? []) as { placement: number; name: string; rankingPoints: number; wins: number }[];
      const warnings = (data.warnings ?? []) as string[];
      const t = data.tournament ?? {};
      setAdvanceMsg(
        "Ranking final recalculado." +
          ` [${t.knockoutMatches > 0 ? `mata-mata: ${t.knockoutMatches} partidas` : "sem mata-mata"}` +
          `${t.isOfficial ? "" : " · NÃO OFICIAL"}${t.isTest ? " · TESTE" : ""}]` +
          (top.length
            ? " Top: " + top.map((x) => `${x.placement}º ${x.name} (${x.wins}V, ${x.rankingPoints}pts)`).join(" · ")
            : "") +
          (warnings.length ? " ⚠ " + warnings.join(" ⚠ ") : "")
      );
      router.refresh();
    } else {
      setAdvanceMsg(data.error || "Erro ao recalcular ranking");
    }
  }

  // Controlled repair: simulate first, then apply one round with a reason.
  async function balanceMatches() {
    setBalancing(true);
    setErr(null);
    setAdvanceMsg(null);
    const sim = await fetch(`/api/admin/tournaments/${tournamentId}/balance-matches`, { method: "POST" });
    const data = await sim.json().catch(() => ({}));
    setBalancing(false);
    if (!sim.ok) { setAdvanceMsg(data.error || "Erro na simulação do reparo"); return; }
    type Plan = { round: number; missing: string[]; duplicates: { userId: string; matchIds: string[] }[]; proposals: { player1Id: string; player2Id: string }[]; unresolved: { userId: string; reason: string }[]; noop: boolean };
    const plans = ((data.plans ?? []) as { plan?: Plan; impact?: string | null }[]).filter((p) => p.plan);
    const name = (id: string) => participants.find((p) => p.userId === id)?.name ?? id;
    const lines: string[] = [];
    let target: Plan | null = null;
    let impact: string | null = null;
    for (const { plan, impact: imp } of plans) {
      const p = plan!;
      if (p.duplicates.length) lines.push(`Rodada ${p.round}: ${p.duplicates.map((d) => `${name(d.userId)} com ${d.matchIds.length} participações`).join(", ")} (exige decisão manual).`);
      if (p.missing.length) lines.push(`Rodada ${p.round}: sem partida → ${p.missing.map(name).join(", ")}.`);
      if (p.proposals.length) lines.push(`  Proposta: ${p.proposals.map((x) => `${name(x.player1Id)} × ${name(x.player2Id)}`).join(", ")}.`);
      for (const u of p.unresolved) lines.push(`  ${name(u.userId)}: ${u.reason}`);
      if (!target && p.proposals.length) { target = p; impact = imp ?? null; }
    }
    if (!lines.length) { setAdvanceMsg("Tudo certo: cada jogador tem exatamente uma participação por rodada."); return; }
    if (!target || impact) { setAdvanceMsg(`Simulação (nada foi alterado): ${lines.join(" ")}${impact ? ` ${impact}` : ""}`); return; }
    const reason = window.prompt(`Simulação do reparo:\n${lines.join("\n")}\n\nAplicar a proposta da rodada ${target.round}? Informe o motivo:`);
    if (!reason?.trim()) { setAdvanceMsg(`Simulação (nada foi alterado): ${lines.join(" ")}`); return; }
    setBalancing(true);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/balance-matches`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: target.round, apply: true, reason }),
    });
    setBalancing(false);
    const out = await res.json().catch(() => ({}));
    if (res.ok && out.applied) { setAdvanceMsg(`Rodada ${target.round} reparada: ${target.proposals.length} partida(s) criada(s). Registro de auditoria salvo.`); router.refresh(); }
    else setAdvanceMsg(out.error || "Reparo não aplicado.");
  }

  async function recalcStandings() {
    setRecalcing(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/recalc-standings`, { method: "POST" });
    setRecalcing(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setAdvanceMsg(`Classificação recalculada (${data.participants} jogadores).`); router.refresh(); }
    else setAdvanceMsg(data.error || "Erro ao recalcular classificação");
  }

  async function dedupeMatches() {
    setDeduping(true);
    setErr(null);
    setAdvanceMsg(null);
    const sim = await fetch(`/api/admin/tournaments/${tournamentId}/dedupe-matches`, { method: "POST" });
    const data = await sim.json().catch(() => ({}));
    setDeduping(false);
    if (!sim.ok) { setAdvanceMsg(data.error || "Erro ao verificar duplicadas"); return; }
    const decide = (data.needsDecision ?? []) as { round: number; matchIds: string[] }[];
    const note = decide.length ? ` ${decide.length} grupo(s) com mais de uma cópia jogada exigem decisão manual (nada removido): ${decide.map((d) => `rodada ${d.round}`).join(", ")}.` : "";
    if (!(data.removable ?? []).length) { setAdvanceMsg(`Nenhuma cópia não jogada para remover.${note}`); return; }
    const reason = window.prompt(`${data.removable.length} cópia(s) NÃO jogada(s) de partidas repetidas podem ser removidas (com cópia de segurança).${note}\nMotivo:`);
    if (!reason?.trim()) { setAdvanceMsg(`Simulação: ${data.removable.length} cópia(s) removível(is).${note}`); return; }
    setDeduping(true);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/dedupe-matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply: true, reason }) });
    setDeduping(false);
    const out = await res.json().catch(() => ({}));
    if (res.ok) { setAdvanceMsg(`${out.removed} cópia(s) removida(s).${note}`); router.refresh(); }
    else setAdvanceMsg(out.error || "Erro ao remover duplicadas");
  }

  async function advanceRound(exception?: { reason: string }) {
    setAdvancing(true);
    setErr(null);
    setAdvanceMsg(null);
    const res = await fetch(`/api/admin/tournaments/${tournamentId}/advance-round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exception ? { allowRematches: true, reason: exception.reason } : {}),
    });
    setAdvancing(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.alreadyGenerated || data.result?.status === "exists") setAdvanceMsg("A próxima rodada já existe.");
      else if (data.result?.status === "created") { setAdvanceMsg(`Rodada ${data.result.round} gerada.${data.result.notes?.length ? " " + data.result.notes.join(" ") : ""}`); router.refresh(); }
      else { setAdvanceMsg("Fase avançada."); router.refresh(); }
      return;
    }
    const detail = [...(data.notes ?? []), ...((data.issues ?? []) as { message: string }[]).map((i) => i.message)].join(" ");
    if (data.status === "impossible" && !exception) {
      const reason = window.prompt(`${data.error}\n${detail}\n\nPara gerar a rodada permitindo reencontros, informe o motivo (fica registrado):`);
      if (reason?.trim()) return advanceRound({ reason });
    }
    setAdvanceMsg(`${data.error || "Erro ao avançar rodada"} ${detail}`);
  }

  function startEdit(m: MatchRow) {
    setErr(null);
    setConfirmId(null);
    setEditId(m.id);
    const initial = m.sets.length > 0
      ? m.sets.map((s) => ({ p1: s.p1Points, p2: s.p2Points }))
      : [{ p1: 0, p2: 0 }];
    setEditSets(initial);
  }

  function updateSet(idx: number, side: "p1" | "p2", value: number) {
    setEditSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [side]: Math.max(0, value) } : s)));
  }

  async function saveScore(matchId: string, confirm?: { reason: string }) {
    setSavingScore(true);
    setErr(null);
    const res = await fetch(`/api/admin/matches/${matchId}/set-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sets: editSets.map((s) => ({ p1Points: s.p1, p2Points: s.p2 })),
        ...(confirm ? { confirmAfterAdvance: true, reason: confirm.reason } : {}),
      }),
    });
    if (res.status === 409 && !confirm) {
      const data = await res.clone().json().catch(() => ({}));
      if (data.requiresConfirmation) {
        setSavingScore(false);
        const reason = window.prompt(`${data.error}\n\nMotivo da correção:`);
        if (reason?.trim()) return saveScore(matchId, { reason });
        setErr("Correção não salva.");
        return;
      }
    }
    setSavingScore(false);
    if (res.ok) {
      setEditId(null);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Erro ao salvar placar");
    }
  }

  async function resetMatch(matchId: string) {
    setResetting(matchId);
    setErr(null);
    const res = await fetch(`/api/admin/matches/${matchId}/reset`, { method: "POST" });
    setResetting(null);
    setConfirmId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      setErr(data.error || "Erro ao resetar partida");
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Pendente",
    IN_PROGRESS: "Ao Vivo",
    FINISHED: "Encerrada",
  };

  const statusColor: Record<string, string> = {
    PENDING: "text-gray-500",
    IN_PROGRESS: "text-green-400",
    FINISHED: "text-gray-400",
  };

  const byRound = matches.reduce<Record<number, MatchRow[]>>((acc, m) => {
    (acc[m.round] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="mt-8 bg-card border border-brand-red/20 rounded-xl p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-white">Editar Resultados</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Edite os pontos de qualquer partida diretamente, sem resetar e sem transmitir para as arenas. Use &quot;Resetar&quot; apenas para zerar e reinserir pelo placar.
          </p>
        </div>
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            onClick={cloneAsTest}
            disabled={cloneBusy}
            title="Cria um torneio de TESTE com os mesmos jogadores e as mesmas configurações, sem resultados — para ensaiar o fluxo sem afetar o ranking"
            className="text-xs font-bold border border-purple-400/50 text-purple-300 hover:bg-purple-400/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {cloneBusy ? "Duplicando..." : "🧪 Duplicar como Teste"}
          </button>
          {participants.length > 0 && (
            <button
              onClick={() => setPodiumOpen((v) => !v)}
              title="Define manualmente o 1º ao 5º lugar e os pontos de ranking"
              className="text-xs font-bold border border-amber-400/50 text-amber-300 hover:bg-amber-400/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              🏆 Definir Pódio
            </button>
          )}
          <button
            onClick={() => runHealth(false)}
            disabled={healthBusy}
            title="Procura byes quebrados, duplicatas, rodadas travadas, classificação e pontos de ranking errados"
            className="text-xs font-bold border border-blue-400/50 text-blue-300 hover:bg-blue-400/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {healthBusy ? "Verificando..." : "🩺 Diagnóstico"}
          </button>
          <button
            onClick={recalcRanking}
            disabled={rankingBusy}
            title="Recalcula a colocação final e os pontos de ranking (corrige torneios finalizados com a regra antiga)"
            className="text-xs font-bold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {rankingBusy ? "Recalculando..." : "Recalcular Ranking Final"}
          </button>
          <button
            onClick={balanceMatches}
            disabled={balancing}
            title="Verifica se todos jogaram o mesmo número de partidas e gera partidas para quem ficou em falta"
            className="text-xs font-bold border border-brand-yellow/40 text-brand-yellow hover:bg-brand-yellow/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {balancing ? "Verificando..." : "Verificar Partidas"}
          </button>
          <button
            onClick={recalcStandings}
            disabled={recalcing}
            title="Recalcula vitórias/pontos de todos os jogadores a partir das partidas encerradas"
            className="text-xs font-bold border border-brand-yellow/40 text-brand-yellow hover:bg-brand-yellow/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {recalcing ? "Recalculando..." : "Recalcular Classificação"}
          </button>
          <button
            onClick={dedupeMatches}
            disabled={deduping}
            title="Remove partidas duplicadas (mesma rodada e mesmos jogadores)"
            className="text-xs font-bold border border-brand-red/40 text-danger hover:bg-brand-red/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {deduping ? "Removendo..." : "Remover Duplicadas"}
          </button>
          <button
            onClick={() => advanceRound()}
            disabled={advancing}
            title="Gera a próxima rodada se a atual terminou mas não avançou sozinha"
            className="text-xs font-bold border border-brand-yellow/40 text-brand-yellow hover:bg-brand-yellow/10 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {advancing ? "Avançando..." : "Avançar Rodada"}
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-xs font-bold border border-brand-red/40 text-danger hover:bg-brand-red/10 px-3 py-1.5 rounded-lg transition-colors"
          >
            {open ? "Fechar ▲" : "Editar Partidas ▼"}
          </button>
        </div>
      </div>
      {advanceMsg && (
        <div className="mt-3 text-xs px-4 py-2 rounded-lg bg-brand-yellow/10 border border-brand-yellow/30 text-brand-yellow">
          {advanceMsg}
        </div>
      )}

      {podiumOpen && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="text-sm font-bold text-amber-300">Pódio final</div>
          <p className="text-[11px] text-gray-400 mt-0.5 mb-3">
            Use quando o resultado registrado não refletir o que aconteceu. Define a colocação e os
            pontos de ranking direto. Quem não estiver no pódio fica com 0 pontos de ranking.
          </p>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-300 w-14 flex-shrink-0">
                  {i + 1}º · {PODIUM_PTS[i]}pts
                </span>
                <select
                  value={podium[i]}
                  onChange={(e) => setPodium((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  className="flex-1 min-w-0 bg-card border border-line rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  <option value="">— vazio —</option>
                  {participants.map((p) => (
                    <option key={p.userId} value={p.userId}>{p.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className="flex-1" />
            <button
              onClick={() => setPodiumOpen(false)}
              disabled={podiumBusy}
              className="text-xs text-gray-500 hover:text-gray-300 border border-line px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={savePodium}
              disabled={podiumBusy}
              className="text-xs bg-amber-400 hover:bg-amber-300 text-black font-bold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {podiumBusy ? "Salvando..." : "Salvar Pódio"}
            </button>
          </div>
        </div>
      )}

      {health && health.length > 0 && (
        <div className="mt-3 space-y-2">
          {health.map((i) => {
            const c =
              i.severity === "critical" ? "border-red-600 bg-red-900/20 text-red-300"
              : i.severity === "high" ? "border-brand-yellow/50 bg-brand-yellow/10 text-brand-yellow"
              : "border-line bg-card text-gray-400";
            return (
              <div key={i.code} className={`text-xs px-4 py-2.5 rounded-lg border ${c}`}>
                <div className="font-bold uppercase tracking-wide">
                  {i.severity === "critical" ? "🔴 Crítico" : i.severity === "high" ? "🟠 Atenção" : "ℹ️ Info"}
                  {i.count > 1 ? ` · ${i.count}` : ""}
                </div>
                <div className="mt-0.5 text-gray-300">{i.detail}</div>
                <div className="mt-1 font-semibold">→ {i.action}</div>
              </div>
            );
          })}
          {health.some((i) => i.code === "broken_byes" || i.code === "stale_standings") && (
            <button
              onClick={() => runHealth(true)}
              disabled={healthBusy}
              className="text-xs font-bold bg-blue-500 hover:bg-blue-400 text-black px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {healthBusy ? "Reparando..." : "🔧 Reparar automaticamente"}
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="mt-5 space-y-5">
          {err && (
            <div className="text-sm px-4 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-400">
              {err}
            </div>
          )}

          {Object.entries(byRound).map(([round, rMatches]) => (
            <div key={round}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Rodada {round}
              </div>
              <div className="space-y-2">
                {rMatches.map((m) => {
                  const isConfirming = confirmId === m.id;
                  const isResetting = resetting === m.id;
                  const winnerName =
                    m.winnerId === m.player1Id ? m.player1Name :
                    m.winnerId === m.player2Id ? m.player2Name : null;

                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 bg-field border border-line rounded-xl px-4 py-3 flex-wrap"
                    >
                      {/* Match info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{m.player1Name}</span>
                          <span className="text-gray-600 text-xs">vs</span>
                          <span className="text-sm font-semibold text-white truncate">{m.player2Name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-xs font-medium ${statusColor[m.status] ?? "text-gray-500"}`}>
                            {statusLabel[m.status] ?? m.status}
                          </span>
                          {m.isWalkover && (
                            <span className="text-xs text-yellow-500 font-medium">W.O.</span>
                          )}
                          {m.status === "FINISHED" && winnerName && (
                            <>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-brand-yellow font-bold">{winnerName} venceu</span>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-gray-400">{m.p1Sets}×{m.p2Sets} sets</span>
                              <span className="text-gray-700">·</span>
                              <span className="text-xs text-gray-500">{m.p1Points}×{m.p2Points} pts</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editId !== m.id && (
                          <button
                            onClick={() => startEdit(m)}
                            disabled={!!resetting || savingScore}
                            className="text-xs text-gray-300 hover:text-brand-yellow border border-line hover:border-brand-yellow/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                          >
                            ✎ Editar Placar
                          </button>
                        )}
                        {isConfirming ? (
                          <>
                            <span className="text-xs text-red-400 font-semibold">Resetar? (irreversível)</span>
                            <button
                              onClick={() => resetMatch(m.id)}
                              disabled={isResetting}
                              className="text-xs bg-brand-red hover:bg-brand-red-hover text-white font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isResetting ? "Resetando..." : "Confirmar"}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-500 hover:text-gray-300 border border-line px-2 py-1.5 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmId(m.id)}
                            disabled={m.status === "PENDING" || !!resetting}
                            className="text-xs text-gray-400 hover:text-danger border border-line hover:border-brand-red/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                          >
                            Resetar
                          </button>
                        )}
                      </div>

                      {/* Inline score editor */}
                      {editId === m.id && (
                        <div className="w-full mt-3 pt-3 border-t border-line">
                          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              Pontos por set
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-brand-yellow font-bold truncate max-w-[9rem]">{m.player1Name}</span>
                              <span className="text-gray-600">×</span>
                              <span className="text-danger font-bold truncate max-w-[9rem]">{m.player2Name}</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            {editSets.map((s, idx) => (
                              <div key={idx} className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500 w-12">Set {idx + 1}</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={s.p1}
                                  onChange={(e) => updateSet(idx, "p1", parseInt(e.target.value || "0", 10))}
                                  className="w-16 bg-card border border-line rounded-lg px-2 py-1 text-sm text-white text-center focus:border-brand-yellow outline-none"
                                />
                                <span className="text-gray-600 text-xs">×</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={s.p2}
                                  onChange={(e) => updateSet(idx, "p2", parseInt(e.target.value || "0", 10))}
                                  className="w-16 bg-card border border-line rounded-lg px-2 py-1 text-sm text-white text-center focus:border-brand-red outline-none"
                                />
                                {editSets.length > 1 && (
                                  <button
                                    onClick={() => setEditSets((prev) => prev.filter((_, i) => i !== idx))}
                                    className="text-xs text-gray-500 hover:text-danger px-2 py-1"
                                    title="Remover set"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 mt-4 flex-wrap">
                            <button
                              onClick={() => setEditSets((prev) => [...prev, { p1: 0, p2: 0 }])}
                              className="text-xs text-gray-300 hover:text-white border border-line px-3 py-1.5 rounded-lg transition-colors"
                            >
                              + Adicionar set
                            </button>
                            <div className="flex-1" />
                            <button
                              onClick={() => setEditId(null)}
                              disabled={savingScore}
                              className="text-xs text-gray-500 hover:text-gray-300 border border-line px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => saveScore(m.id)}
                              disabled={savingScore}
                              className="text-xs bg-brand-yellow hover:bg-brand-yellow-hover text-black font-bold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {savingScore ? "Salvando..." : "Salvar Placar"}
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-2">
                            Quem tiver mais pontos vence o set. O vencedor da partida é definido por quem alcançar o número de sets necessário. Não afeta as arenas.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
