// Safe rendering of user-written text (descriptions, regulations).
//  - Never uses dangerouslySetInnerHTML: everything is a React text node, so
//    any HTML/script typed by a user is shown as plain text.
//  - Keeps the author's line breaks and blank-line paragraphs.
//  - Lines that already start with a bullet ("-", "•", "*", "–") render as a
//    list, so the bullets read as a list; the wording itself is never changed.
//  - http(s) URLs become links (rel=nofollow noopener); other schemes stay text.
//  - Long words/URLs wrap instead of widening the page.
import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
const BULLET_RE = /^\s*[-•*–]\s+/;

function linkify(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(
      <a key={`${keyBase}-${i}`} href={m[0]} target="_blank" rel="nofollow noopener noreferrer" className="text-[var(--accent)] underline underline-offset-2 break-anywhere">
        {m[0]}
      </a>
    );
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className={`space-y-3 break-anywhere ${className}`}>
      {paragraphs.map((para, pi) => {
        const lines = para.split("\n");
        // Group consecutive bullet lines into one list; keep other lines as-is.
        const blocks: { list: boolean; lines: string[] }[] = [];
        for (const line of lines) {
          const isBullet = BULLET_RE.test(line);
          const prev = blocks[blocks.length - 1];
          if (prev && prev.list === isBullet) prev.lines.push(line);
          else blocks.push({ list: isBullet, lines: [line] });
        }
        return (
          <div key={pi}>
            {blocks.map((b, bi) =>
              b.list ? (
                <ul key={bi} className="list-disc pl-5 space-y-1 my-1">
                  {b.lines.map((l, li) => (
                    <li key={li}>{linkify(l.replace(BULLET_RE, ""), `${pi}-${bi}-${li}`)}</li>
                  ))}
                </ul>
              ) : (
                <p key={bi}>
                  {b.lines.map((l, li) => (
                    <Fragment key={li}>
                      {li > 0 && <br />}
                      {linkify(l, `${pi}-${bi}-${li}`)}
                    </Fragment>
                  ))}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Heuristic for "long enough to collapse": many characters or many lines. */
export function isLongText(text: string | null | undefined, maxChars = 500, maxLines = 8): boolean {
  if (!text) return false;
  return text.length > maxChars || text.split("\n").length > maxLines;
}
