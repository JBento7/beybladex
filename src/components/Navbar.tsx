"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { logout } from "@/lib/client/logout";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { communityOf } from "@/lib/communities";
import { useHomeCommunity, clearCommunityCookie } from "@/components/CommunityTheme";
import { isJudgeAccount } from "@/lib/judgeAccount";
import JudgeKiosk from "@/components/JudgeKiosk";
import AuthLink from "@/components/AuthLink";
import { cachedProfile, loadProfile, type HeaderProfile } from "@/lib/client/profileCache";
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
  const logo = isLbm ? home.icon : "/brand/lblnovo-384.webp";
  const pathname = usePathname() ?? "/";
  const uid = session?.user?.id ?? null;
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const avatarUrl = profile?.avatarUrl ?? null;

  // Cached per user (lib/client/profileCache): no request per navigation;
  // refetched only when the profile screen announces a change.
  useEffect(() => {
    if (!uid) { setProfile(null); return; }
    setProfile(cachedProfile(uid));
    let alive = true;
    const pull = (force: boolean) => loadProfile(uid, force).then((p) => { if (alive && p) setProfile(p); });
    pull(false);
    const onUpdate = () => pull(true);
    window.addEventListener("lbl:profile-updated", onUpdate);
    return () => { alive = false; window.removeEventListener("lbl:profile-updated", onUpdate); };
  }, [uid]);

  const doSignOut = () => { clearCommunityCookie(); logout("/"); };

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
            onClick={() => { clearCommunityCookie(); logout("/login"); }}
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
            <img src={logo} alt={home.fullName} width={isLbm ? 36 : 64} height={36} fetchPriority="high" className="h-9 w-auto max-w-[96px] object-contain" />
          </Link>
          <p className="flex-1 min-w-0 truncate font-display text-title-3 text-fg" aria-hidden="true">
            {sectionTitle(pathname)}
          </p>
          {status === "loading" ? (
            <span className="w-24 h-9 rounded-ctl bg-field animate-pulse" aria-hidden="true" />
          ) : signedIn ? (
            <AccountMenu name={profile?.name ?? session.user.name ?? "Conta"} avatarUrl={avatarUrl} isOrganizer={isOrganizer} onSignOut={doSignOut} />
          ) : (
            <div className="flex items-center gap-2">
              <AuthLink pathname={pathname} className={buttonClass("secondary", "sm")}>Entrar</AuthLink>
              <AuthLink page="/register" pathname={pathname} className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>Criar conta</AuthLink>
            </div>
          )}
        </div>
      </header>
      <MobileNavigation pathname={pathname} signedIn={signedIn} isOrganizer={isOrganizer} onSignOut={doSignOut} />
    </>
  );
}
