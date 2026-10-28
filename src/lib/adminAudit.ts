// Audit trail for destructive / historical admin operations.
//  - Tournament-scoped operations get a TournamentAdminAction row (who, what,
//    why, before/after summary) — the same table the Swiss repair tools use.
//  - Every operation also writes one structured log line (no passwords,
//    tokens, cookies or personal free text — callers pass minimal fields).
// Auditing never blocks the operation: a failure to write the row is logged.
import type { Prisma } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "./prisma";
import { logEvent } from "./observability";

export type AdminAuditInput = {
  kind: string;                 // e.g. "MATCH_RESET", "POINT_DELETE", "USER_DELETE"
  session: Session | null;
  tournamentId?: string | null;
  reason?: string | null;       // free text typed by the admin (optional)
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  target?: Record<string, string | number | boolean | null>; // ids/counts only
};

export async function auditAdminAction(a: AdminAuditInput): Promise<void> {
  const actorId = a.session?.user?.id ?? null;
  logEvent("admin_action", { kind: a.kind, actorId, actorScope: a.session?.user?.adminCommunity ?? "geral", tournamentId: a.tournamentId ?? null, ...a.target });
  if (!a.tournamentId) return;
  try {
    await prisma.tournamentAdminAction.create({
      data: {
        tournamentId: a.tournamentId,
        kind: a.kind,
        reason: (a.reason ?? "").slice(0, 500) || "(sem motivo informado)",
        actorId,
        before: a.before,
        after: a.after,
      },
    });
  } catch (e) {
    logEvent("admin_action_audit_failed", { kind: a.kind, tournamentId: a.tournamentId, code: (e as { code?: string })?.code ?? null });
  }
}

export { testToolsAllowed, TEST_TOOLS_DISABLED_MESSAGE } from "./testTools";
