"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Active-link styling: highlight the current section
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const linkClass = (href: string) =>
    `transition-colors font-medium ${
      isActive(href) ? "text-[#f0a500]" : "text-gray-300 hover:text-[#f0a500]"
    }`;
  const mobileLinkClass = (href: string) =>
    `block px-3 py-2 transition-colors ${
      isActive(href) ? "text-[#f0a500]" : "text-gray-300 hover:text-[#f0a500]"
    }`;

  useEffect(() => {
    if (session) {
      fetch("/api/profile/me")
        .then((r) => r.json())
        .then((d) => setAvatarUrl(d.avatarUrl ?? null))
        .catch(() => {});
    } else {
      setAvatarUrl(null);
    }
  }, [session]);

  return (
    <nav className="bg-[#1a1a1a] border-b border-[#2a2a2a] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img src="/lbl-logo.png" alt="LBL" className="h-10 w-auto" />
            <img src="/liga.png" alt="Liga Beyblade Londrina" className="h-8 w-auto hidden sm:block" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/tournaments" className={linkClass("/tournaments")}>
              Torneios
            </Link>
            <Link href="/community" className={linkClass("/community")}>
              Comunidade
            </Link>
            <Link href="/upcoming" className={linkClass("/upcoming")}>
              Próximos
            </Link>
            {session && (
              <>
                <Link href="/dashboard" className={linkClass("/dashboard")}>
                  Painel
                </Link>
                <Link href="/profile" className={linkClass("/profile")}>
                  Perfil
                </Link>
                <Link href="/tournaments/create" className={linkClass("/tournaments/create")}>
                  Criar
                </Link>
                {session.user.role === "ORGANIZER" && (
                  <Link href="/admin" className={linkClass("/admin")}>
                    Admin
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-3">
                <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-[#f0a500]/50 flex-shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={session.user.name ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#f0a500]/20 flex items-center justify-center">
                        <img src="/bey-removebg-preview.png" alt="" className="w-5 h-5 object-contain" />
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-400">
                    {session.user.name}
                    {session.user.role === "ORGANIZER" && (
                      <span className="ml-1 text-xs bg-[#f0a500] text-black px-1.5 py-0.5 rounded font-semibold">
                        ADMIN
                      </span>
                    )}
                  </span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded-lg text-gray-200 transition-colors"
                >
                  Sair
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm text-gray-300 hover:text-[#f0a500] transition-colors font-medium"
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="text-sm bg-[#c8102e] hover:bg-[#a00d24] text-white px-4 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  Cadastrar
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-gray-300 hover:text-[#f0a500] p-2"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-[#2a2a2a] space-y-2">
            <Link href="/tournaments" className={mobileLinkClass("/tournaments")} onClick={() => setMenuOpen(false)}>Torneios</Link>
            <Link href="/community" className={mobileLinkClass("/community")} onClick={() => setMenuOpen(false)}>Comunidade</Link>
            <Link href="/upcoming" className={mobileLinkClass("/upcoming")} onClick={() => setMenuOpen(false)}>Próximos</Link>
            {session && (
              <>
                <Link href="/dashboard" className={mobileLinkClass("/dashboard")} onClick={() => setMenuOpen(false)}>Painel</Link>
                <Link href="/profile" className={mobileLinkClass("/profile")} onClick={() => setMenuOpen(false)}>Perfil</Link>
                <Link href="/tournaments/create" className={mobileLinkClass("/tournaments/create")} onClick={() => setMenuOpen(false)}>Criar Torneio</Link>
                {session.user.role === "ORGANIZER" && (
                  <Link href="/admin" className={mobileLinkClass("/admin")} onClick={() => setMenuOpen(false)}>Admin</Link>
                )}
                <button
                  onClick={() => { signOut({ callbackUrl: "/" }); setMenuOpen(false); }}
                  className="block w-full text-left px-3 py-2 text-red-400 hover:text-red-300"
                >
                  Sair
                </button>
              </>
            )}
            {!session && (
              <>
                <Link href="/login" className="block px-3 py-2 text-gray-300 hover:text-[#f0a500]" onClick={() => setMenuOpen(false)}>Entrar</Link>
                <Link href="/register" className="block px-3 py-2 text-[#f0a500] font-semibold" onClick={() => setMenuOpen(false)}>Cadastrar</Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
