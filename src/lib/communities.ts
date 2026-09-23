// Visual identity of each community. Slugs match the Community rows seeded by
// /api/migrate and Tournament.communitySlug.
export type CommunityInfo = {
  slug: string;
  name: string; // short, e.g. "LBM"
  fullName: string;
  city: string;
  logo: string;
  color: string;
};

export const COMMUNITY_LIST: CommunityInfo[] = [
  { slug: "lbl", name: "LBL", fullName: "Liga Beyblade Londrina", city: "Londrina", logo: "/lbl-logo.png", color: "#f0a500" },
  { slug: "lbm", name: "LBM", fullName: "Liga Beyblade Maringá", city: "Maringá", logo: "/lbm-logo.webp", color: "#6ac146" },
];

export function communityOf(slug: string | null | undefined): CommunityInfo {
  return COMMUNITY_LIST.find((c) => c.slug === slug) ?? COMMUNITY_LIST[0];
}

// Cookie holding the player's league, read by the root layout (server) and
// written by the client. Lives here, in a plain module, because a server
// component that imports a value from a "use client" file gets a client
// reference instead of the value — the layout was looking up a cookie with a
// bogus name and never found the league.
export const COMMUNITY_COOKIE = "community";
