import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, homePathFor, verifySessionToken } from "@/server/auth/session-token";

/**
 * First line of defence: sends visitors to the right place.
 * It is not the only check: pages and Server Actions read the session again.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!session) {
    return pathname === "/login" ? NextResponse.next() : redirectTo("/login");
  }

  const home = homePathFor(session.role);
  if (pathname === "/" || pathname === "/login") return redirectTo(home);
  // Each role only reaches its own area.
  const areas = session.role === "employee" ? ["/chat", "/perfil"] : ["/console"];
  if (!areas.some((area) => pathname === area || pathname.startsWith(`${area}/`))) return redirectTo(home);
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/chat/:path*", "/perfil/:path*", "/console/:path*"],
};
