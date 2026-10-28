// Arena (telão) and judge kiosk accounts: arenaN@<liga>.arena / juizN@<liga>.juiz.
// They used to be created with a fixed password written in the source code
// (public repository) — anyone could sign in as a judge kiosk and score its
// league's matches. Now each new account gets a random password, shown ONCE
// to the admin who created it; `rotate` replaces the password of existing
// accounts (use it once to retire the old fixed passwords).
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Session } from "next-auth";
import { prisma } from "./prisma";
import { auditAdminAction } from "./adminAudit";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i: easy to type on a tablet
export function kioskPassword(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export type KioskKind = "arena" | "juiz";
export type KioskResult = { email: string; status: "criado" | "senha trocada" | "já existe" | "erro"; password?: string };

export async function ensureKioskAccounts(opts: { kind: KioskKind; community: string; rotate: boolean; session: Session; count?: number }): Promise<KioskResult[]> {
  const { kind, community, rotate, session } = opts;
  const results: KioskResult[] = [];
  for (let n = 1; n <= (opts.count ?? 5); n++) {
    const email = kind === "arena" ? `arena${n}@${community}.arena` : `juiz${n}@${community}.juiz`;
    const name = kind === "arena"
      ? (community === "lbl" ? `Arena ${n}` : `Arena ${n} ${community.toUpperCase()}`)
      : `Juiz ${n} ${community.toUpperCase()}`;
    try {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing && !rotate) { results.push({ email, status: "já existe" }); continue; }
      const password = kioskPassword();
      const hash = await bcrypt.hash(password, 10);
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
        results.push({ email, status: "senha trocada", password });
      } else {
        await prisma.user.create({
          data: kind === "arena"
            ? { name, email, password: hash, role: "PARTICIPANT", bladerName: name }
            : { name, email, password: hash, role: "PARTICIPANT", bladerName: name, canJudge: true, homeCommunity: community },
        });
        results.push({ email, status: "criado", password });
      }
    } catch (e) {
      results.push({ email, status: "erro" });
      console.error("[kiosk accounts]", email, (e as { code?: string })?.code ?? "");
    }
  }
  // Audit without passwords.
  await auditAdminAction({
    kind: kind === "arena" ? "KIOSK_ARENA_ACCOUNTS" : "KIOSK_JUDGE_ACCOUNTS", session,
    target: { community, rotate, created: results.filter((r) => r.status === "criado").length, rotated: results.filter((r) => r.status === "senha trocada").length },
  });
  return results;
}

/** Community the admin may act on: a league admin only on their own league. */
export function kioskCommunity(session: Session, requested: unknown): string {
  if (session.user.adminCommunity) return session.user.adminCommunity;
  return typeof requested === "string" && /^(lbl|lbm)$/.test(requested) ? requested : "lbl";
}
