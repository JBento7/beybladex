// Judge-only accounts (juizN@<community>.juiz): a tablet/phone handed to a
// judge. It sees only the community's live tournaments and their scoreboards —
// no navbar, no other pages. Plain module so middleware (edge) can import it.
const JUDGE_RE = /^juiz\d+@([a-z0-9]+)\.juiz$/i;

export function isJudgeAccount(email: string | null | undefined): boolean {
  return JUDGE_RE.test(email ?? "");
}

export function judgeCommunity(email: string | null | undefined): string {
  return JUDGE_RE.exec(email ?? "")?.[1].toLowerCase() ?? "lbl";
}

// Paths a judge account may open; everything else sends it back to /juiz.
export function judgeMayOpen(pathname: string): boolean {
  if (pathname === "/juiz" || pathname === "/login") return true;
  const m = /^\/tournaments\/([^/]+)$/.exec(pathname);
  return !!m && m[1] !== "create";
}
