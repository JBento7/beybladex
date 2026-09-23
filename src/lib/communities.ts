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
