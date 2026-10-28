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
    <div className="min-h-screen bg-app flex items-center justify-center p-8">
      <div className="bg-card border border-line rounded-2xl p-8 max-w-md w-full text-center">
        <div className="mb-4 flex justify-center"><img src="/brand/bey-96.webp" alt="" className="w-12 h-12 object-contain" /></div>
        <h2 className="text-xl font-bold text-white mb-2">Algo deu errado</h2>
        <p className="text-gray-300 text-sm mb-6">
          Não foi possível carregar esta página. Pode ser uma falha temporária de conexão — tente novamente.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="tap bg-brand-yellow hover:bg-brand-yellow-hover text-black font-bold text-sm px-5 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
          <Link
            href="/"
            className="tap inline-flex items-center text-sm text-gray-200 hover:text-white px-5 transition-colors"
          >
            Ir para o início
          </Link>
        </div>
        {error.digest && (
          <p className="text-gray-400 text-xs mt-5">Código para suporte: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
