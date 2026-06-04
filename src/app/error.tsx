"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log full details to the console for debugging; never show to the user
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-8">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 max-w-md w-full text-center">
        <div className="mb-4 flex justify-center"><img src="/bey-removebg-preview.png" alt="" className="w-12 h-12 object-contain" /></div>
        <h2 className="text-xl font-bold text-white mb-2">Algo deu errado</h2>
        <p className="text-gray-400 text-sm mb-6">
          Não foi possível carregar esta página. Tente novamente em instantes.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-white px-5 py-2.5 transition-colors"
          >
            Ir ao painel
          </Link>
        </div>
        {error.digest && (
          <p className="text-gray-600 text-[10px] mt-5">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
