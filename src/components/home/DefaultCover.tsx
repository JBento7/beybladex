// Cover used when an event has no image: dark card, a discreet red graphic,
// the LBL logo and the event name/date as real text (decorative here — the
// same information is in the card body, so screen readers skip it).
export default function DefaultCover({ name, date, className = "" }: { name: string; date?: string | null; className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden bg-card ${className || "relative"}`}>
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 225">
        <path d="M250 0 L400 0 L400 225 L170 225 Z" fill="#C8102E" opacity="0.18" />
        <path d="M300 0 L330 0 L230 225 L200 225 Z" fill="#C8102E" opacity="0.35" />
      </svg>
      <div className="relative h-full flex flex-col justify-between p-5 md:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lblnovo.png" alt="" className="h-10 md:h-12 w-auto self-start object-contain" />
        <div>
          <p className="font-display text-title-3 text-fg line-clamp-2 break-anywhere">{name}</p>
          {date && <p className="text-small text-fg-2 mt-1">{date}</p>}
        </div>
      </div>
    </div>
  );
}
