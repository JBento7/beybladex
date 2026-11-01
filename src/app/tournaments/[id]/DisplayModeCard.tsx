"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISPLAY_MODE_DESCRIPTION, DISPLAY_MODE_LABEL, type DisplayMode } from "@/lib/displayMode";

// "Modo de arbitragem" in the event's admin details (docs/MODO-ARBITRAGEM.md).
// The organizer/admin may correct it until matches effectively start; after
// that the reason is shown instead of the button. The server decides.
export default function DisplayModeCard({
  tournamentId, mode, canChange, lockedReason,
}: {
  tournamentId: string;
  mode: DisplayMode;
  canChange: boolean;
  lockedReason: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const other: DisplayMode = mode === "ARENA" ? "JUDGE_ONLY" : "ARENA";
  async function change() {
    if (!window.confirm(`Mudar para “${DISPLAY_MODE_LABEL[other]}”?\n\n${DISPLAY_MODE_DESCRIPTION[other]}\n\nArenas, juízes, sets e pontos não mudam.`)) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/display-mode`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: other }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Não foi possível alterar o modo.");
      else router.refresh();
    } catch { setErr("Sem conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-sm">
      <p className="text-xs text-gray-400">Modo de arbitragem</p>
      <p className="font-bold text-white"><span aria-hidden="true">{mode === "ARENA" ? "📺 " : "📱 "}</span>{DISPLAY_MODE_LABEL[mode]}</p>
      {canChange && !lockedReason && (
        <button type="button" onClick={change} disabled={busy} className="tap mt-1 w-full text-xs font-bold text-gray-100 bg-field hover:bg-hover border border-line rounded-lg px-3 disabled:opacity-50">
          {busy ? "Alterando…" : `Mudar para “${DISPLAY_MODE_LABEL[other]}”`}
        </button>
      )}
      {canChange && lockedReason && <p className="mt-1 text-xs text-gray-400">Não pode mais ser alterado: {lockedReason}</p>}
      {err && <p role="alert" className="text-danger text-xs mt-1">{err}</p>}
    </div>
  );
}
