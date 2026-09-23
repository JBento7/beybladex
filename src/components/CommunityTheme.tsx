"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { communityOf } from "@/lib/communities";

// Publishes the signed-in player's league color as --accent, so branded pieces
// (the navbar, for a start) follow the league the player chose in their profile.
export default function CommunityTheme() {
  const { data: session } = useSession();
  const color = communityOf(session?.user?.homeCommunity).color;
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", color);
  }, [color]);
  return null;
}
