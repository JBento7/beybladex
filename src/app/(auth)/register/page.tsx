"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeCallbackUrl } from "@/lib/safeRedirect";
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
  });
  type FieldErrors = Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
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
    // Clear a field's error as soon as it's edited.
    if (fieldErrors[e.target.name as keyof FieldErrors]) {
      setFieldErrors((fe) => ({ ...fe, [e.target.name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fe: FieldErrors = {};
    if (!form.name.trim()) fe.name = "Informe seu nome.";
    if (!form.email.trim()) fe.email = "Informe seu e-mail.";
    if (form.password.length < 6) fe.password = "A senha precisa ter pelo menos 6 caracteres.";
    if (form.confirmPassword !== form.password) fe.confirmPassword = "As senhas não são iguais.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) {
      // Move focus to the first field with a problem.
      const first = (["name", "email", "password", "confirmPassword"] as const).find((k) => fe[k]);
      if (first) document.getElementById(first)?.focus();
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg: string = data.error || "Erro ao criar conta.";
        // Show the server's message next to the field it is about; the typed
        // values stay in the form.
        if (res.status === 409) { setFieldErrors({ email: "Este e-mail já tem uma conta. Entre ou use outro e-mail." }); document.getElementById("email")?.focus(); }
        else if (/senha/i.test(msg)) { setFieldErrors({ password: msg }); document.getElementById("password")?.focus(); }
        else setError(msg);
        return;
      }

      router.push(callbackUrl ? `/login?registered=1&callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login?registered=1");
    } catch {
      setError("Não foi possível conectar. Verifique sua internet e tente novamente — seus dados continuam preenchidos.");
    } finally {
      setLoading(false);
    }
  }

  const isOrganizer = inviteToken && inviteValid === true;
  const inputCls = (bad?: string) =>
    `tap w-full bg-[#252525] border ${bad ? "border-red-400" : "border-[#444]"} focus:border-[#f0a500] focus:ring-1 focus:ring-[#f0a500] rounded-lg px-4 text-white outline-none transition-colors`;
  const errorText = (id: string, msg?: string) =>
    msg ? <p id={`${id}-erro`} className="mt-1.5 text-sm text-red-300">{msg}</p> : null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 block">
        <img src="/lblnovo.png" alt="LBL — página inicial" className="h-14 md:h-[90px] w-auto" />
      </Link>

      <div className="w-full max-w-md bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Criar conta</h1>
        <p className="text-gray-300 text-center mb-4 text-sm">
          {isOrganizer
            ? "Você foi convidado para se tornar um Organizador!"
            : "Só nome, e-mail e senha. Suas Beyblades você cadastra depois, no perfil."}
        </p>

        {inviteToken && (
          <div className={`text-sm px-3 py-2 rounded-lg mb-4 text-center font-medium ${
            inviteChecking
              ? "bg-[#252525] text-gray-300"
              : inviteValid
              ? "bg-[#f0a500]/10 border border-[#f0a500]/30 text-amber-200"
              : "bg-red-900/30 border border-red-700 text-red-300"
          }`}>
            {inviteChecking
              ? "Verificando convite..."
              : inviteValid
              ? "👑 Convite válido — você será cadastrado como Organizador"
              : "⚠️ Convite inválido ou expirado"}
          </div>
        )}

        {!inviteToken && (
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-100 text-sm px-4 py-3 rounded-lg mb-4">
            <p className="font-bold mb-1">O que sua conta permite</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Inscrever-se em torneios e acompanhar seus resultados e o ranking.</li>
              <li>Criar e conduzir <strong>BeyEncontros</strong> (eventos casuais, que não contam no ranking).</li>
              <li>Torneios <strong>oficiais</strong> são criados pela organização da liga; acesso de organizador é liberado por convite.</li>
            </ul>
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-900/30 border border-red-700 text-red-200 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1.5">Nome</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              autoFocus
              value={form.name}
              onChange={handleChange}
              required
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? "name-erro" : undefined}
              placeholder="Seu nome"
              className={inputCls(fieldErrors.name)}
            />
            {errorText("name", fieldErrors.name)}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-200 mb-1.5">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-erro" : undefined}
              placeholder="voce@exemplo.com"
              className={inputCls(fieldErrors.email)}
            />
            {errorText("email", fieldErrors.email)}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-1.5">Senha</label>
            <p id="password-regra" className="text-sm text-gray-300 mb-1.5">Mínimo de 6 caracteres.</p>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={`password-regra${fieldErrors.password ? " password-erro" : ""}`}
                className={`${inputCls(fieldErrors.password)} pr-24`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center justify-center min-w-[44px] px-3 text-sm font-semibold text-gray-300 hover:text-[#f0a500] transition-colors"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {errorText("password", fieldErrors.password)}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-200 mb-1.5">Confirmar senha</label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-erro" : undefined}
                placeholder="Repita a senha"
                className={`${inputCls(fieldErrors.confirmPassword)} pr-24`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 flex items-center justify-center min-w-[44px] px-3 text-sm font-semibold text-gray-300 hover:text-[#f0a500] transition-colors"
              >
                {showConfirmPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {errorText("confirmPassword", fieldErrors.confirmPassword)}
          </div>

          <button
            type="submit"
            disabled={loading || (!!inviteToken && inviteChecking)}
            className="tap w-full bg-[#f0a500] hover:bg-[#d4940a] disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold rounded-xl transition-colors text-base mt-2"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-300 mt-6">
          Já tem uma conta?{" "}
          <Link href={callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"} className="text-[#f0a500] hover:text-[#d4940a] font-medium underline-offset-2 hover:underline">
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
