export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/profile/:path*", "/tournaments/create/:path*", "/admin/:path*"],
};
