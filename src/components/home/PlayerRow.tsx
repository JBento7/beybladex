import Link from "next/link";
import { Avatar } from "@/components/shell/AccountMenu";

// One ranking line: position (number + medal color for 1–3), avatar, nickname
// and points. The signed-in player's own line gets a discreet highlight + "Você".
const POS_COLOR: Record<number, string> = { 1: "text-medal-gold", 2: "text-medal-silver", 3: "text-medal-bronze" };

export default function PlayerRow({
  position,
  userId,
  name,
  avatarUrl,
  points,
  isMe,
}: {
  position: number;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  points: number;
  isMe?: boolean;
}) {
  return (
    <li className={`flex items-center gap-3 min-h-16 px-3 rounded-ctl ${isMe ? "bg-field border border-line" : ""}`}>
      <span className={`w-8 shrink-0 text-center font-display text-title-3 tabular ${POS_COLOR[position] ?? "text-fg-2"}`}>
        {position}<span className="sr-only">º lugar</span>
      </span>
      <Avatar name={name} url={avatarUrl} size={40} />
      <Link href={`/community/${userId}`} className="flex-1 min-w-0 text-body font-semibold text-fg hover:underline underline-offset-2 line-clamp-2 break-anywhere">
        {name}
        {isMe && <span className="ml-2 align-middle rounded-tag bg-info-bg px-2 py-0.5 text-label text-info">Você</span>}
      </Link>
      <span className="shrink-0 text-right">
        <span className="block text-[1.125rem] leading-6 font-bold tabular text-fg">{points}</span>
        <span className="block text-label font-medium text-fg-3">pts</span>
      </span>
    </li>
  );
}
