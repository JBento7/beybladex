"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-8">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 max-w-md w-full text-center">
        <div className="mb-4 flex justify-center"><img src="/bey-removebg-preview.png" alt="" className="w-12 h-12 object-contain" /></div>
        <h2 className="text-xl font-bold text-white mb-2">Erro no painel</h2>
        <p className="text-gray-400 text-sm mb-6">
          Não foi possível carregar seus dados. Tente novamente.
        </p>
        <button
          onClick={() => reset()}
          className="bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors"
        >
          Tentar novamente
        </button>
        {error.digest && (
          <p className="text-gray-600 text-[10px] mt-5">Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
