"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// "Tentar novamente" for server-rendered error states: re-runs the server
// render (router.refresh) and shows that it is working.
export default function RetryButton({ label = "Tentar novamente", subtle = false }: { label?: string; subtle?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className={subtle
        ? "inline-flex items-center min-h-9 px-3 rounded-lg text-xs font-semibold border border-line text-gray-200 hover:border-brand-yellow disabled:opacity-60"
        : "tap inline-flex items-center justify-center px-6 rounded-xl font-bold bg-brand-red hover:bg-brand-red-hover disabled:opacity-60 text-white"}
    >
      {pending ? "Carregando…" : label}
    </button>
  );
}
