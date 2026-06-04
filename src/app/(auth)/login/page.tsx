"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const verified = searchParams.get("verified");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("E-mail ou senha inválidos.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <img src="/bey-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
        <span className="text-2xl font-black text-[#f0a500]">BeybladeX</span>
      </Link>

      <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Bem-vindo de volta</h1>
        <p className="text-gray-400 text-center mb-6 text-sm">Entre na sua conta do campeonato</p>

        {registered && (
          <div aria-live="polite" className="bg-green-900/30 border border-green-700 text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
            ✅ Conta criada! Verifique seu e-mail para confirmar o cadastro, depois faça login.
          </div>
        )}

        {verified && (
          <div aria-live="polite" className="bg-[#f0a500]/10 border border-[#f0a500]/40 text-[#f0a500] text-sm px-4 py-3 rounded-lg mb-4">
            <img src="/bey-removebg-preview.png" alt="" className="w-4 h-4 object-contain inline-block mr-1" />E-mail confirmado! Faça login para entrar.
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@exemplo.com"
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">Senha</label>
              <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
                Esqueceu sua senha?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 pr-12 text-white placeholder-gray-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#f0a500] transition-colors"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors text-base"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Não tem uma conta?{" "}
          <Link href="/register" className="text-[#f0a500] hover:text-[#d4940a] font-medium">
            Cadastre-se aqui
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d0d]" />}>
      <LoginForm />
    </Suspense>
  );
}
