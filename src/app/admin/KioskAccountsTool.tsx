"use client";

import { useState } from "react";

type Row = { email: string; status: string; password?: string };

// Creates the telão (arenaN@liga.arena) and judge kiosk (juizN@liga.juiz)
// accounts. Passwords are random and shown ONCE here — write them down.
// "Trocar senhas" replaces the passwords of accounts that already exist
// (do it once to retire the old fixed passwords).
export default function KioskAccountsTool({ generalAdmin }: { generalAdmin: boolean }) {
  const [community, setCommunity] = useState("lbl");
  const [loading, setLoading] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState<"arenas" | "judges" | null>(null);

  async function run(kind: "arenas" | "judges", rotate: boolean) {
    setLoading(`${kind}${rotate ? "-rotate" : ""}`);
    setMessage(null);
    setRows(null);
    try {
      const res = await fetch(`/api/seed-${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ c: community, rotate }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || "Não foi possível concluir."); return; }
      setRows(data.users);
      setMessage(data.note);
    } catch {
      setMessage("Sem conexão. Tente novamente.");
    } finally {
      setLoading(null);
      setConfirmRotate(null);
    }
  }

  const btn = "text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50";
  return (
    <div className="bg-card border border-line rounded-xl p-6 mt-8">
      <h2 className="text-lg font-bold text-white mb-1">Contas de arena (telão) e de juiz</h2>
      <p className="text-gray-400 text-sm mb-4">
        Cria as contas que ainda não existem, com senhas aleatórias. As senhas aparecem só uma vez, aqui — anote antes de sair da página.
      </p>
      {generalAdmin && (
        <label className="block text-sm text-gray-300 mb-3">
          Liga{" "}
          <select value={community} onChange={(e) => setCommunity(e.target.value)} className="ml-2 bg-field border border-line rounded-lg px-3 py-1.5 text-white">
            <option value="lbl">LBL</option>
            <option value="lbm">LBM</option>
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run("arenas", false)} disabled={!!loading} className={`${btn} bg-brand-red hover:bg-brand-red-hover text-white`}>
          {loading === "arenas" ? "Criando…" : "Criar contas de arena"}
        </button>
        <button onClick={() => run("judges", false)} disabled={!!loading} className={`${btn} bg-brand-red hover:bg-brand-red-hover text-white`}>
          {loading === "judges" ? "Criando…" : "Criar contas de juiz"}
        </button>
        <button onClick={() => setConfirmRotate("arenas")} disabled={!!loading} className={`${btn} bg-field border border-line text-gray-200 hover:bg-hover`}>
          Trocar senhas das arenas
        </button>
        <button onClick={() => setConfirmRotate("judges")} disabled={!!loading} className={`${btn} bg-field border border-line text-gray-200 hover:bg-hover`}>
          Trocar senhas dos juízes
        </button>
      </div>
      {confirmRotate && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-amber-400 font-semibold">
            Os tablets {confirmRotate === "arenas" ? "dos telões" : "dos juízes"} precisarão entrar de novo com a senha nova. Continuar?
          </span>
          <button onClick={() => run(confirmRotate, true)} disabled={!!loading} className={`${btn} bg-brand-red hover:bg-brand-red-hover text-white`}>
            {loading ? "Trocando…" : "Sim, trocar"}
          </button>
          <button onClick={() => setConfirmRotate(null)} className={`${btn} bg-field border border-line text-gray-300`}>Cancelar</button>
        </div>
      )}
      {message && <p role="status" className="mt-4 text-sm text-gray-200">{message}</p>}
      {rows && (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-gray-400"><th className="py-1">Conta</th><th>Situação</th><th>Senha</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email} className="border-t border-line">
                <td className="py-1.5 text-white">{r.email}</td>
                <td className="text-gray-300">{r.status}</td>
                <td className="font-mono text-brand-yellow">{r.password ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
