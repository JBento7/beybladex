// Judge → telão commands (PRONTOS, Iniciar/recontagem, vídeo de lançamento),
// docs/JUIZ-TELAO.md. Each press carries a commandId chosen by the panel and
// reused by every resend of that press:
//  - the server stamps a signal once per commandId (a resend never restarts a
//    video that already started);
//  - the telão runs each commandId once, whether it arrives over the local
//    link, the server, or both;
//  - "Recontagem" is a NEW press (new commandId), never a retry.
import { prisma } from "./prisma";
import { arenaSignalKey } from "./arenaIdentity";

export function parseCommandId(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v) ? v : null;
}

export type ArenaSignal = { at: number; commandId: string | null; matchId: string | null };

export function readSignal(data: string | null | undefined): ArenaSignal | null {
  if (!data) return null;
  try {
    const d = JSON.parse(data);
    return typeof d?.at === "number" ? { at: d.at, commandId: d.commandId ?? null, matchId: d.matchId ?? null } : null;
  } catch {
    return null;
  }
}

/** Stamps a per-arena signal (ready/launch). Same commandId → no new stamp. */
export async function stampArenaSignal(kind: "ready" | "launch", community: string, arena: number, cmd: { commandId: string | null; matchId: string }): Promise<{ at: number; replay: boolean }> {
  const key = arenaSignalKey(kind, community, arena);
  const cur = readSignal((await prisma.arenaLayout.findUnique({ where: { key } }))?.data);
  if (cmd.commandId && cur?.commandId === cmd.commandId) return { at: cur.at, replay: true };
  const at = Date.now();
  const data = JSON.stringify({ at, commandId: cmd.commandId, matchId: cmd.matchId });
  await prisma.arenaLayout.upsert({ where: { key }, create: { key, data }, update: { data } });
  return { at, replay: false };
}
