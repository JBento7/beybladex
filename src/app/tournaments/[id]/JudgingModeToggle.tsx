"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// BeyEncontro setting: allow the event's approved participants to register
// scores (explicit opt-in). Official events never show this.
export default function JudgingModeToggle({ tournamentId, mode }: { tournamentId: string; mode: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const open = mode === "OPEN_PARTICIPANTS";
  async function toggle() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/judging`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: open ? "RESTRICTED" : "OPEN_PARTICIPANTS" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Não foi possível alterar.");
      else router.refresh();
    } catch { setErr("Sem conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return (
    <div className="text-sm">
      <label className="tap flex items-center gap-2 cursor-pointer text-gray-200">
        <input type="checkbox" checked={open} onChange={toggle} disabled={busy} className="w-5 h-5 accent-[#C8102E]" />
        Participantes podem registrar placares
      </label>
      {err && <p role="alert" className="text-danger text-xs mt-1">{err}</p>}
    </div>
  );
}
