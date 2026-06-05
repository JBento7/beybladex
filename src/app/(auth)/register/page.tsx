"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    beyblade: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteChecking, setInviteChecking] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    setInviteChecking(true);
    fetch(`/api/invites/${inviteToken}`)
      .then((r) => r.json())
      .then((data) => {
        setInviteValid(data.valid === true);
        setInviteChecking(false);
      })
      .catch(() => {
        setInviteValid(false);
        setInviteChecking(false);
      });
  }, [inviteToken]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (form.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (inviteToken && inviteValid === false) {
      setError("Convite inválido ou expirado.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          inviteToken: inviteToken || undefined,
          beyblade: form.beyblade || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao criar conta.");
        return;
      }

      router.push("/login?registered=1");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const isOrganizer = inviteToken && inviteValid === true;

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 block">
        <img src="/lblnovo.png" alt="Liga Beyblade Londrina" className="h-14 md:h-[100px] w-auto" />
      </Link>

      <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Criar Conta</h1>
        <p className="text-gray-400 text-center mb-4 text-sm">
          {isOrganizer
            ? "Você foi convidado para se tornar um Organizador!"
            : "Junte-se à comunidade de campeonatos Beyblade"}
        </p>

        {inviteToken && (
          <div className={`text-xs px-3 py-2 rounded-lg mb-4 text-center font-medium ${
            inviteChecking
              ? "bg-[#252525] text-gray-400"
              : inviteValid
              ? "bg-[#f0a500]/10 border border-[#f0a500]/30 text-[#f0a500]"
              : "bg-red-900/30 border border-red-700 text-red-400"
          }`}>
            {inviteChecking
              ? "Verificando convite..."
              : inviteValid
              ? "👑 Convite válido — você será cadastrado como Organizador"
              : "⚠️ Convite inválido ou expirado"}
          </div>
        )}

        {!inviteToken && (
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs px-3 py-2 rounded-lg mb-4 text-center">
            <img src="/bey-removebg-preview.png" alt="" className="w-4 h-4 object-contain inline-block mr-1" />Você será cadastrado como Participante
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">Nome Completo</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              autoFocus
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Seu nome"
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="voce@exemplo.com"
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="beyblade" className="block text-sm font-medium text-gray-300 mb-1.5">
              Nome da Beyblade <span className="text-gray-500 font-normal">(opcional)</span>
            </label>
            <input
              id="beyblade"
              name="beyblade"
              type="text"
              value={form.beyblade}
              onChange={handleChange}
              placeholder="ex: Brave Valkyrie"
              className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">Senha</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                required
                placeholder="Mínimo 6 caracteres"
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

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1.5">Confirmar Senha</label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Repita a senha"
                className="w-full bg-[#252525] border border-[#333] focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 py-2.5 pr-12 text-white placeholder-gray-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-[#f0a500] transition-colors"
              >
                {showConfirmPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (!!inviteToken && inviteChecking)}
            className="w-full bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors text-base mt-2"
          >
            {loading ? "Criando conta..." : "Criar Conta"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-[#f0a500] hover:text-[#d4940a] font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d0d0d]" />}>
      <RegisterForm />
    </Suspense>
  );
}
