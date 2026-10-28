// Visual identity of each community. Slugs match the Community rows seeded by
// /api/migrate and Tournament.communitySlug.
export type CommunityInfo = {
  slug: string;
  name: string; // short, e.g. "LBM"
  fullName: string;
  city: string;
  /** Large logo (telão, covers). */
  logo: string;
  /** Small round icon (badges, tabs, selectors): a few KB instead of ~200 KB. */
  icon: string;
  color: string;
  /** Default event cover: wide logo + brand color for the diagonal stripes. */
  coverLogo: string;
  coverColor: string;
};

export const COMMUNITY_LIST: CommunityInfo[] = [
  { slug: "lbl", name: "LBL", fullName: "Liga Beyblade Londrina", city: "Londrina", logo: "/brand/lbl-logo-320.webp", icon: "/brand/lbl-icon-96.webp", color: "#f0a500", coverLogo: "/brand/lblnovo-768.webp", coverColor: "#C8102E" },
  { slug: "lbm", name: "LBM", fullName: "Liga Beyblade Maringá", city: "Maringá", logo: "/brand/lbm-logo-320.webp", icon: "/brand/lbm-icon-96.webp", color: "#6ac146", coverLogo: "/brand/lbm-logo-320.webp", coverColor: "#6ac146" },
];

/** Exact lookup — no fallback to another league (used for event identity). */
export function findCommunity(slug: string | null | undefined): CommunityInfo | null {
  return COMMUNITY_LIST.find((c) => c.slug === slug) ?? null;
}

export function communityOf(slug: string | null | undefined): CommunityInfo {
  return COMMUNITY_LIST.find((c) => c.slug === slug) ?? COMMUNITY_LIST[0];
}

// Cookie holding the player's league, read by the root layout (server) and
// written by the client. Lives here, in a plain module, because a server
// component that imports a value from a "use client" file gets a client
// reference instead of the value — the layout was looking up a cookie with a
// bogus name and never found the league.
export const COMMUNITY_COOKIE = "community";
