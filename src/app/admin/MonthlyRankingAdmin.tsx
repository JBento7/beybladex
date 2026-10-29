"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// "Ranking mensal — LBL e LBM" (docs/RANKING-MENSAL.md). Everything is
// validated again on the server (permissions, league scope, balances, closed
// months); this card only collects the input. Each action carries a request id
// that is kept until it succeeds, so a double click or a retry after a network
// error can't apply the same adjustment twice.

type Entry = { id: string; name: string; position: number; points: number; tournamentPoints: number; adjustmentPoints: number; wins: number; losses: number };
type Op = { id: string; kind: string; points: number; reason: string; createdAt: string; player: string | null; admin: string };
type State = {
  league: "lbl" | "lbm"; month: string; current: string; months: string[];
  status: "open" | "closed";
  leader: Entry | null;
  champion: { id: string; name: string; points: number } | null;
  closedAt: string | null; closedBy: string | null;
  entries: Entry[];
  rules: { pointsTable: number[]; tiebreak: "NICKNAME" | "WINS"; fromMonth: string | null };
  limits: { maxPlaces: number; maxPoints: number; tiebreaks: Record<string, string> };
  openEvents: { id: string; name: string; status: string }[];
  operations: Op[];
};
type Player = { id: string; name: string; fullName: string | null; league: string | null };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`);
const KIND_LABEL: Record<string, string> = {
  ADD: "Pontos adicionados", REMOVE: "Pontos retirados", RESET_PLAYER: "Jogador zerado", RESET_MONTH: "Mês zerado", RULES: "Regras alteradas", CLOSE: "Mês fechado",
};
const field = "w-full bg-field border border-line focus:border-brand-yellow rounded-lg px-3 py-2 text-white outline-none disabled:opacity-50";
const btn = "min-h-[44px] px-4 rounded-lg font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export default function MonthlyRankingAdmin({ leagues, initialMonth }: { leagues: ("lbl" | "lbm")[]; initialMonth: string }) {
  const [league, setLeague] = useState(leagues[0]);
  const [month, setMonth] = useState<string>(initialMonth);
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Adjustment form
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  // Rules form
  const [table, setTable] = useState<string[]>([]);
  const [tiebreak, setTiebreak] = useState<"NICKNAME" | "WINS">("NICKNAME");
  const [rulesReason, setRulesReason] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // One request id per pending action; renewed after success or when the input changes.
  const req = useRef<Record<string, string>>({});
  const idFor = (key: string) => (req.current[key] ??= newId());
  const renew = (key: string) => { delete req.current[key]; };

  const load = useCallback(async (lg: string, m: string) => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/monthly-ranking?league=${lg}&month=${m}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { setLoadError(data.error || "Não foi possível carregar o ranking mensal."); return; }
      setState(data);
      setTable(data.rules.pointsTable.map(String));
      setTiebreak(data.rules.tiebreak);
    } catch {
      setLoadError("Falha de conexão ao carregar o ranking mensal.");
    }
  }, []);
  useEffect(() => { load(league, month); }, [league, month, load]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || (player && q === player.name)) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/monthly-ranking/players?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(res.ok ? data.players : []);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, player]);

  const closed = state?.status === "closed";

  async function post(path: string, key: string, body: Record<string, unknown>, success: (d: Record<string, unknown>) => string) {
    if (!state) return false;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/monthly-ranking/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: state.league, month: state.month, requestId: idFor(key), ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data.error || "Não foi possível concluir a operação." }); return false; }
      renew(key);
      setMsg({ ok: true, text: (data.replayed ? "Esta operação já tinha sido registrada — nada foi duplicado. " : "") + success(data) });
      await load(state.league, state.month);
      return true;
    } catch {
      setMsg({ ok: false, text: "Falha de conexão. Tente de novo: a mesma operação não será aplicada duas vezes." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function adjust(kind: "ADD" | "REMOVE" | "RESET_PLAYER" | "RESET_MONTH") {
    if (!reason.trim()) { setMsg({ ok: false, text: "Informe o motivo da alteração." }); return; }
    if (kind !== "RESET_MONTH" && !player) { setMsg({ ok: false, text: "Selecione o jogador." }); return; }
    if ((kind === "ADD" || kind === "REMOVE") && !(Number(amount) > 0)) { setMsg({ ok: false, text: "Informe a quantidade de pontos." }); return; }
    const where = `${state!.league.toUpperCase()} · ${monthLabel(state!.month)}`;
    if (kind === "RESET_PLAYER" && !window.confirm(`Zerar ${player!.name} em ${where}? Um ajuste compensatório deixa o total do mês em 0 (os resultados dos torneios não são apagados).`)) return;
    if (kind === "RESET_MONTH" && !window.confirm(`Zerar o mês inteiro (${where})? Todos os jogadores ficam com 0 por ajustes compensatórios; os resultados dos torneios não são apagados.`)) return;
    const ok = await post("adjust", `adjust:${kind}`, { kind, userId: player?.id, points: Number(amount), reason }, (d) => {
      const changes = (d.changes as { delta: number; after: number }[]) ?? [];
      if (kind === "RESET_MONTH") return `Mês zerado: ${changes.length} jogador(es).`;
      const c = changes[0];
      return c ? `${player!.name}: ${c.delta > 0 ? "+" : ""}${c.delta} → total ${c.after} no mês.` : "Ajuste registrado.";
    });
    if (ok) { setAmount(""); setReason(""); }
  }

  async function saveRules() {
    if (!rulesReason.trim()) { setMsg({ ok: false, text: "Informe o motivo da mudança de regras." }); return; }
    const ok = await post("rules", "rules", { pointsTable: table.map((v) => Number(v)), tiebreak, reason: rulesReason }, () =>
      "Regras salvas. Valem para as próximas finalizações deste mês e dos seguintes; torneios já finalizados não mudam.");
    if (ok) setRulesReason("");
  }

  async function doClose() {
    const ok = await post("close", "close", { expectedLeaderId: state?.leader?.id ?? null }, (d) => {
      const c = d.champion as { name: string; points: number } | undefined;
      return c ? `Mês fechado. Campeão: ${c.name} (${c.points} pts).` : "Mês fechado.";
    });
    if (ok) setConfirmClose(false);
  }

  return (
    <section aria-labelledby="mensal-titulo" className="mt-8 bg-card border border-line rounded-xl p-6">
      <h2 id="mensal-titulo" className="text-lg font-bold text-white">Ranking mensal — LBL e LBM</h2>
      <p className="text-sm text-gray-400 mt-1">Cada liga tem o próprio ranking por mês. Ajustes ficam separados dos resultados dos torneios.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-gray-300">Liga
          <select className={`${field} mt-1`} value={league} disabled={busy || leagues.length < 2} onChange={(e) => { setLeague(e.target.value as "lbl" | "lbm"); setPlayer(null); setQuery(""); setMsg(null); }}>
            {leagues.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="block text-sm text-gray-300">Mês e ano
          <select className={`${field} mt-1`} value={month} disabled={busy || !state} onChange={(e) => { setMonth(e.target.value); setMsg(null); setConfirmClose(false); }}>
            {(state?.months ?? []).map((m) => <option key={m} value={m}>{monthLabel(m)}{m === state?.current ? " (atual)" : ""}</option>)}
          </select>
        </label>
      </div>

      {loadError && <p role="alert" className="mt-4 text-sm text-red-300">{loadError}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-500/10 text-green-300 border border-green-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>{msg.text}</p>}

      {state && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className={`font-bold px-3 py-1 rounded-full border ${closed ? "border-gray-500 text-gray-200" : "border-green-500/50 text-green-300"}`}>
              {closed ? "Encerrado" : "Aberto"}
            </span>
            {closed && state.champion ? (
              <span className="text-gray-200">🏆 Campeão: <strong className="text-white">{state.champion.name}</strong> · {state.champion.points} pts
                {state.closedAt && <> · fechado em {new Date(state.closedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{state.closedBy ? ` por ${state.closedBy}` : ""}</>}
              </span>
            ) : state.leader ? (
              <span className="text-gray-200">Líder atual: <strong className="text-white">{state.leader.name}</strong> · {state.leader.points} pts</span>
            ) : (
              <span className="text-gray-400">Ninguém pontuou neste mês ainda.</span>
            )}
          </div>

          {state.entries.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Classificação de {monthLabel(state.month)}</caption>
                <thead><tr className="text-gray-400 border-b border-line">
                  <th scope="col" className="text-left py-2 px-2 font-medium">#</th>
                  <th scope="col" className="text-left py-2 px-2 font-medium">Jogador</th>
                  <th scope="col" className="text-right py-2 px-2 font-medium">Torneios</th>
                  <th scope="col" className="text-right py-2 px-2 font-medium">Ajustes</th>
                  <th scope="col" className="text-right py-2 px-2 font-medium">Total</th>
                  <th scope="col" className="text-right py-2 px-2 font-medium">V/D</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {state.entries.slice(0, 10).map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 px-2 text-gray-300 tabular-nums">{e.position}º</td>
                      <td className="py-2 px-2 text-white break-anywhere">{e.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{e.tournamentPoints}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-300">{e.adjustmentPoints > 0 ? "+" : ""}{e.adjustmentPoints}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-brand-yellow">{e.points}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-400">{e.wins}/{e.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.entries.length > 10 && <p className="mt-1 text-xs text-gray-500">Mostrando os 10 primeiros de {state.entries.length}. A lista completa está em /rankings.</p>}
            </div>
          )}

          {/* Adjustments */}
          <fieldset disabled={busy || closed} className="mt-6 border-t border-line pt-4">
            <legend className="text-base font-bold text-white">Ajustar pontos</legend>
            {closed && <p className="text-sm text-gray-400 mt-1">Mês encerrado: o ranking arquivado não pode ser alterado.</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <label htmlFor="mensal-busca" className="block text-sm text-gray-300">Jogador</label>
                <input id="mensal-busca" className={`${field} mt-1`} value={query} placeholder="Buscar por apelido ou nome" autoComplete="off"
                  onChange={(e) => { setQuery(e.target.value); setPlayer(null); renew("adjust:ADD"); renew("adjust:REMOVE"); renew("adjust:RESET_PLAYER"); }} />
                {results.length > 0 && (
                  <ul role="listbox" aria-label="Jogadores encontrados" className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-line bg-card shadow-lg">
                    {results.map((p) => (
                      <li key={p.id} role="option" aria-selected={player?.id === p.id}>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm text-white hover:bg-field min-h-[44px]"
                          onClick={() => { setPlayer(p); setQuery(p.name); setResults([]); }}>
                          {p.name}{p.fullName ? <span className="text-gray-400"> · {p.fullName}</span> : null}{p.league ? <span className="text-gray-500"> · {p.league.toUpperCase()}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {player && <p className="mt-1 text-xs text-green-300">Selecionado: {player.name}</p>}
              </div>
              <label className="block text-sm text-gray-300">Quantidade de pontos
                <input type="number" inputMode="numeric" min={1} step={1} className={`${field} mt-1`} value={amount}
                  onChange={(e) => { setAmount(e.target.value); renew("adjust:ADD"); renew("adjust:REMOVE"); }} />
              </label>
            </div>
            <label className="block text-sm text-gray-300 mt-3">Motivo <span className="text-red-400">*</span>
              <textarea required rows={2} maxLength={500} className={`${field} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: correção de resultado lançado errado" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={`${btn} bg-green-600 hover:bg-green-500 text-white`} onClick={() => adjust("ADD")}>Adicionar pontos</button>
              <button type="button" className={`${btn} bg-field hover:bg-hover text-white border border-line`} onClick={() => adjust("REMOVE")}>Retirar pontos</button>
              <button type="button" className={`${btn} bg-field hover:bg-hover text-amber-300 border border-amber-500/40`} onClick={() => adjust("RESET_PLAYER")}>Zerar jogador</button>
              <button type="button" className={`${btn} bg-field hover:bg-hover text-red-300 border border-red-500/40`} onClick={() => adjust("RESET_MONTH")}>Zerar mês inteiro</button>
            </div>
          </fieldset>

          {/* Rules */}
          <fieldset disabled={busy || closed} className="mt-6 border-t border-line pt-4">
            <legend className="text-base font-bold text-white">Regras de pontuação</legend>
            <p className="text-sm text-gray-400 mt-1">
              {state.rules.fromMonth ? `Em vigor desde ${monthLabel(state.rules.fromMonth)}.` : "Tabela padrão."} Mudanças valem para as próximas finalizações deste mês e dos seguintes; torneios já finalizados não são recalculados. Pontuação dobrada multiplica esta tabela por 2.
            </p>
            <ol className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {table.map((v, i) => (
                <li key={i}>
                  <label className="block text-xs text-gray-400">{i + 1}º lugar
                    <input type="number" inputMode="numeric" min={0} max={state.limits.maxPoints} step={1} className={`${field} mt-1`} value={v}
                      onChange={(e) => { const t = [...table]; t[i] = e.target.value; setTable(t); renew("rules"); }} />
                  </label>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-xs text-gray-500">Demais posições: 0 pontos. Até {state.limits.maxPlaces} colocações, valores inteiros de 0 a {state.limits.maxPoints}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={`${btn} bg-field text-gray-200 border border-line`} disabled={table.length >= state.limits.maxPlaces} onClick={() => { setTable([...table, "0"]); renew("rules"); }}>+ Colocação</button>
              <button type="button" className={`${btn} bg-field text-gray-200 border border-line`} disabled={table.length <= 1} onClick={() => { setTable(table.slice(0, -1)); renew("rules"); }}>− Colocação</button>
            </div>
            <label className="block text-sm text-gray-300 mt-3">Desempate
              <select className={`${field} mt-1`} value={tiebreak} onChange={(e) => { setTiebreak(e.target.value as "NICKNAME" | "WINS"); renew("rules"); }}>
                {Object.entries(state.limits.tiebreaks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <p className="mt-1 text-xs text-gray-500">Último critério sempre: identificador do jogador (ordem estável).</p>
            <label className="block text-sm text-gray-300 mt-3">Motivo <span className="text-red-400">*</span>
              <input className={`${field} mt-1`} maxLength={500} value={rulesReason} onChange={(e) => setRulesReason(e.target.value)} />
            </label>
            <button type="button" className={`${btn} mt-3 bg-brand-yellow text-black`} onClick={saveRules}>Salvar regras</button>
          </fieldset>

          {/* Closing */}
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-base font-bold text-white">Fechamento</h3>
            {state.openEvents.length > 0 && !closed && (
              <div role="note" className="mt-2 text-sm text-amber-300">
                Torneios oficiais deste mês ainda em inscrições ou andamento:
                <ul className="list-disc pl-5 mt-1">{state.openEvents.map((t) => <li key={t.id}><a className="underline" href={`/tournaments/${t.id}`}>{t.name}</a></li>)}</ul>
              </div>
            )}
            {!confirmClose ? (
              <button type="button" className={`${btn} mt-3 bg-brand-red hover:bg-brand-red-hover text-white`}
                disabled={busy || closed || state.month > state.current || !state.leader || state.openEvents.length > 0}
                onClick={() => { setConfirmClose(true); setMsg(null); }}>
                Fechar mês e definir campeão
              </button>
            ) : (
              <div role="alertdialog" aria-labelledby="fechar-titulo" className="mt-3 rounded-lg border border-brand-red/50 bg-brand-red/10 p-4">
                <p id="fechar-titulo" className="font-bold text-white">Fechar {state.league.toUpperCase()} · {monthLabel(state.month)}?</p>
                <p className="mt-1 text-sm text-gray-200">
                  Campeão: <strong>{state.leader?.name}</strong> com {state.leader?.points} pts. A classificação é recalculada no servidor antes de gravar; se o líder mudar, nada é fechado.
                  Depois do fechamento, o mês não aceita ajustes, recálculos nem finalizações. Não há reabertura. A outra liga não é afetada.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={`${btn} bg-brand-red text-white`} disabled={busy} onClick={doClose}>{busy ? "Fechando…" : "Confirmar fechamento"}</button>
                  <button type="button" className={`${btn} bg-field text-gray-200 border border-line`} disabled={busy} onClick={() => setConfirmClose(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* History */}
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-base font-bold text-white">Histórico de alterações</h3>
            {state.operations.length === 0 ? (
              <p className="mt-2 text-sm text-gray-400">Nenhuma alteração administrativa neste mês.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {state.operations.map((o) => (
                  <li key={o.id} className="rounded-lg bg-field px-3 py-2">
                    <span className="font-semibold text-white">{KIND_LABEL[o.kind] ?? o.kind}</span>
                    {o.player && <> · {o.player}</>}
                    {o.points !== 0 && <span className={o.points > 0 ? "text-green-300" : "text-red-300"}> · {o.points > 0 ? "+" : ""}{o.points}</span>}
                    <span className="block text-xs text-gray-400">
                      {new Date(o.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {o.admin} · {o.reason}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
