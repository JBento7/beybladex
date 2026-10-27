"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { communityOf } from "@/lib/communities";
import { useHomeCommunity, clearCommunityCookie } from "@/components/CommunityTheme";
import { isJudgeAccount } from "@/lib/judgeAccount";
import JudgeKiosk from "@/components/JudgeKiosk";
import Sidebar from "@/components/shell/Sidebar";
import MobileNavigation from "@/components/shell/MobileNavigation";
import AccountMenu from "@/components/shell/AccountMenu";
import { sectionTitle } from "@/components/shell/navItems";
import { buttonClass } from "@/components/ui/Button";

// App shell chrome, rendered by every page that already includes <Navbar />:
// side menu (tablet/desktop), header (all sizes) and bottom bar (phones).
// The `data-app-shell` marker lets globals.css offset the page content.
export default function Navbar() {
  const { data: session, status } = useSession();
  // The app is branded with the player's own league (logo + accent color).
  const home = communityOf(useHomeCommunity());
  const isLbm = home.slug === "lbm";
  const logo = isLbm ? home.logo : "/lblnovo.png";
  const pathname = usePathname() ?? "/";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

  const doSignOut = () => { clearCommunityCookie(); signOut({ callbackUrl: "/" }); };

  // Judge accounts get no menu: just the way back to their tournament list.
  if (isJudgeAccount(session?.user?.email)) {
    return (
      <nav className="bg-shell border-b border-line sticky top-0 z-50">
        <JudgeKiosk />
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/juiz" className="text-[var(--accent)] font-bold">
            {pathname === "/juiz" ? "Juiz" : "‹ Torneios"}
          </Link>
          <button
            onClick={() => { clearCommunityCookie(); signOut({ callbackUrl: "/login" }); }}
            className="tap text-sm text-gray-400 hover:text-white"
          >
            Sair
          </button>
        </div>
      </nav>
    );
  }

  const signedIn = !!session;
  const isOrganizer = session?.user.role === "ORGANIZER";

  return (
    <>
      <span data-app-shell hidden />
      <Sidebar pathname={pathname} signedIn={signedIn} isOrganizer={isOrganizer} logo={logo} logoAlt={home.fullName} />
      <header className="sticky top-0 z-30 bg-shell border-b border-line">
        <div className="mx-auto max-w-content flex items-center gap-3 min-h-[var(--header-h)] px-4 md:px-6 desk:px-8">
          {/* Phones have no side menu, so the logo lives in the header. */}
          <Link href="/" aria-label="LBL — página inicial" className="md:hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={home.fullName} className="h-9 w-auto max-w-[96px] object-contain" />
          </Link>
          <p className="flex-1 min-w-0 truncate font-display text-title-3 text-fg" aria-hidden="true">
            {sectionTitle(pathname)}
          </p>
          {status === "loading" ? (
            <span className="w-24 h-9 rounded-ctl bg-field animate-pulse" aria-hidden="true" />
          ) : signedIn ? (
            <AccountMenu name={session.user.name ?? "Conta"} avatarUrl={avatarUrl} isOrganizer={isOrganizer} onSignOut={doSignOut} />
          ) : (
            <div className="flex items-center gap-2">
              <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} className={buttonClass("secondary", "sm")}>Entrar</Link>
              <Link href="/register" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>Criar conta</Link>
            </div>
          )}
        </div>
      </header>
      <MobileNavigation pathname={pathname} signedIn={signedIn} isOrganizer={isOrganizer} onSignOut={doSignOut} />
    </>
  );
}
