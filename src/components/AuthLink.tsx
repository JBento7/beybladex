"use client";

import { useRouter } from "next/navigation";
import { authUrl } from "@/lib/safeRedirect";

// "Entrar" / "Criar conta" that return to the exact screen the user was on.
// The query string is read at click time: list filters update the URL with
// history.replaceState, which a pathname-only href would lose. Nothing is
// re-executed after login — the user lands back on the screen and decides.
export default function AuthLink({ page = "/login", pathname, className, children }: {
  page?: "/login" | "/register"; pathname: string; className?: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const here = () => (typeof window === "undefined" ? pathname : window.location.pathname + window.location.search);
  return (
    <a
      href={authUrl(pathname, page)}
      className={className}
      onFocus={(e) => { e.currentTarget.href = authUrl(here(), page); }}
      onPointerEnter={(e) => { e.currentTarget.href = authUrl(here(), page); }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) { e.currentTarget.href = authUrl(here(), page); return; }
        e.preventDefault();
        router.push(authUrl(here(), page));
      }}
    >
      {children}
    </a>
  );
}
