"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// "Tentar novamente" for server-rendered error states: re-runs the server
// render (router.refresh) and shows that it is working.
export default function RetryButton({ label = "Tentar novamente" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className="tap inline-flex items-center justify-center px-6 rounded-xl font-bold bg-[#c8102e] hover:bg-[#a00d24] disabled:opacity-60 text-white"
    >
      {pending ? "Carregando…" : label}
    </button>
  );
}
