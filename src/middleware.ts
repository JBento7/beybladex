import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isJudgeAccount, judgeMayOpen } from "@/lib/judgeAccount";
import { isPrivatePage } from "@/lib/privatePages";

// Pages that require a login.
const PROTECTED = ["/dashboard", "/profile", "/tournaments/create", "/admin", "/community", "/arena", "/combos", "/beyparts", "/juiz"];
const PROTECTED_RE = /^\/tournaments\/[^/]+\/(edit|certificates)$/;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token && (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) || PROTECTED_RE.test(pathname))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  // Judge accounts are locked to their tournament list and scoreboards.
  if (token && isJudgeAccount(token.email as string | undefined) && !judgeMayOpen(pathname)) {
    return NextResponse.redirect(new URL("/juiz", req.url));
  }

  const res = NextResponse.next();
  // Offline cache marker (public/sw.js): only pages rendered WITHOUT a session
  // may be stored on the device, so a logged-in screen is never kept.
  if (!token && !isPrivatePage(pathname)) res.headers.set("x-lbl-cacheable", "public");
  return res;
}

export const config = {
  // Pages only: skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
