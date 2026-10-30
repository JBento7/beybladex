"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { findCommunity } from "@/lib/communities";

// Cover of an event card, in this order of preference:
//   1. the event's own image (as uploaded — never altered),
//   2. the default cover of the league the event belongs to,
//   3. a neutral platform cover (partnerships / unknown league).
// The generated covers carry only identity (logo + graphic): name, date and
// time live in the card body, so they are decorative (hidden from screen
// readers). A broken image falls back once — no retry loop.
export default function EventCover({
  bannerUrl,
  communitySlug,
  isPartnership = false,
  className = "",
  priority = false,
}: {
  bannerUrl?: string | null;
  communitySlug?: string | null;
  isPartnership?: boolean;
  className?: string;
  /** Above-the-fold image (e.g. the first slide): load right away, high priority. */
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (bannerUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={bannerUrl}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        width={1600}
        height={900}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover bg-field ${className}`}
      />
    );
  }

  const league = isPartnership ? null : findCommunity(communitySlug);
  const stripe = league?.coverColor ?? "#98A6B9";
  return (
    <div aria-hidden="true" className={`relative w-full h-full overflow-hidden bg-card ${className}`}>
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 225">
        <path d="M250 0 L400 0 L400 225 L170 225 Z" fill={stripe} opacity={league ? 0.14 : 0.08} />
        <path d="M300 0 L330 0 L230 225 L200 225 Z" fill={stripe} opacity={league ? 0.3 : 0.14} />
        <path d="M350 0 L362 0 L262 225 L250 225 Z" fill={stripe} opacity={league ? 0.22 : 0.1} />
      </svg>
      <div className="absolute inset-5 flex items-center justify-center">
        {league ? (
          // Logo keeps its proportions (contain), at least 20px from the edges.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={league.coverLogo} alt="" width={240} height={135} className="max-w-[60%] max-h-[60%] w-auto h-auto object-contain" />
        ) : (
          <Trophy className="w-12 h-12 text-fg-3" strokeWidth={1.5} />
        )}
      </div>
    </div>
  );
}
