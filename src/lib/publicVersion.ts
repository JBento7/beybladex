// Fingerprint of everything public about tournaments: count + sum of every
// Tournament.stateVersion (bumped by database triggers on any visible change —
// status, sign-ups, results). One aggregate over the small Tournament table.
// Used by the live-update endpoint and as the key of public caches, so a
// cached page refreshes as soon as something changes instead of after a timer.
import { prisma } from "./prisma";

export async function tournamentsVersion(): Promise<string> {
  const rows = await prisma.$queryRaw<{ n: bigint; s: bigint | null }[]>`SELECT count(*) AS n, sum("stateVersion") AS s FROM "Tournament"`;
  return `${rows[0]?.n ?? 0}.${rows[0]?.s ?? 0}`;
}
