"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Organizer recovery: retry the round advance (idempotent on the server —
// it never duplicates a round). Shows the server's diagnosis when it can't.
export default function RetryAdvanceButton({ tournamentId }: { tournamentId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/advance-round`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setMsg("Avanço concluído."); router.refresh(); }
      else setMsg(`${d.error ?? "Não foi possível avançar."} ${(d.notes ?? []).join(" ")}`);
    } catch { setMsg("Sem conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={run} disabled={busy} className="tap inline-flex items-center px-4 rounded-lg bg-brand-red hover:bg-brand-red-hover text-white text-sm font-bold disabled:opacity-60">
        {busy ? "Avançando…" : "Tentar avançar novamente"}
      </button>
      {msg && <p role="status" className="text-sm text-gray-100">{msg}</p>}
    </div>
  );
}
