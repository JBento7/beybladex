"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Token de verificação ausente.");
      return;
    }
    fetch(`/api/auth/verify-email?token=${token}`)
      .then(async (res) => {
        if (res.redirected || res.ok) {
          setStatus("success");
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.error ?? "Erro ao verificar e-mail.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Erro de conexão.");
      });
  }, [token]);

  return (
    <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl text-center">
      {status === "loading" && (
        <>
          <div className="mb-4 flex justify-center animate-spin"><img src="/bey-removebg-preview.png" alt="" className="w-10 h-10 object-contain" /></div>
          <p className="text-gray-400">Verificando seu e-mail...</p>
        </>
      )}
      {status === "success" && (
        <>
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-black text-white mb-2">E-mail confirmado!</h1>
          <p className="text-gray-400 text-sm mb-6">Sua conta está ativa. Faça login para entrar.</p>
          <Link
            href="/login"
            className="inline-block bg-[#f0a500] hover:bg-[#d4940a] text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Ir para o Login
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-black text-white mb-2">Link inválido</h1>
          <p className="text-gray-400 text-sm mb-6">{message}</p>
          <Link
            href="/login"
            className="inline-block text-[#f0a500] hover:text-[#d4940a] text-sm font-medium"
          >
            ← Voltar ao login
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 block">
        <img src="/lblnovo.png" alt="Liga Beyblade Londrina" className="h-14 md:h-20 w-auto" />
      </Link>
      <Suspense fallback={<div className="text-gray-400">Carregando...</div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
