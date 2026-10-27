// Where to go after login/registration: only same-site relative paths, so a
// crafted ?callbackUrl= can't bounce the user to another site.
export function safeCallbackUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw;
  try {
    // next-auth's middleware sends absolute URLs (http://host/path); keep the path.
    if (/^https?:\/\//i.test(v)) {
      const u = new URL(v);
      if (typeof window !== "undefined" && u.origin !== window.location.origin) return null;
      v = u.pathname + u.search + u.hash;
    }
  } catch { return null; }
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  if (v.startsWith("/login") || v.startsWith("/register")) return null;
  return v;
}
