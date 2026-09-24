"use client";

import { createContext, useContext, useEffect } from "react";
import { useSession } from "next-auth/react";
import { communityOf, COMMUNITY_COOKIE } from "@/lib/communities";

// The player's league drives the app's branding (logo + accent color).
//
// It comes from a `community` cookie read on the SERVER in the root layout, so
// every page — including the first paint after a navigation — renders with the
// right league. It used to come from the session, whose permission data is
// cached per server instance: after a change, an instance still holding the old
// value would answer the next page and the branding flipped back to LBL.

const CommunityCtx = createContext<string>("lbl");
export const useHomeCommunity = () => useContext(CommunityCtx);

export function writeCommunityCookie(slug: string) {
  document.cookie = `${COMMUNITY_COOKIE}=${slug}; path=/; max-age=31536000; samesite=lax`;
}

// Forget the league on sign-out, so the next person on this device gets theirs.
export function clearCommunityCookie() {
  document.cookie = `${COMMUNITY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export default function CommunityTheme({ initial, children }: { initial: string | null; children: React.ReactNode }) {
  const { data: session } = useSession();
  const fromSession = session?.user?.homeCommunity ?? null;
  // Cookie wins (instant and instance-independent); the session only seeds it
  // for a player who has no cookie yet (e.g. first visit on a new device).
  const slug = communityOf(initial ?? fromSession).slug;

  useEffect(() => {
    if (!initial && fromSession) writeCommunityCookie(fromSession);
  }, [initial, fromSession]);

  // Keep the browser-tab icon in step with the community (the server sets it
  // from the cookie; this covers a session-seeded first visit).
  useEffect(() => {
    const href = slug === "lbm" ? "/lbm-logo.webp" : "/lbl-logo.png";
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]').forEach((l) => {
      if (l.getAttribute("href")?.split("?")[0] !== href) l.href = href;
    });
  }, [slug]);

  const color = communityOf(slug).color;
  return (
    <CommunityCtx.Provider value={slug}>
      <style>{`:root{--accent:${color}}`}</style>
      {children}
    </CommunityCtx.Provider>
  );
}
