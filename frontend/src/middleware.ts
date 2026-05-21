import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/signin", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token    = request.cookies.get("auth_token")?.value;
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (isPublic) {
    if (token) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Exclude Next internals, the API, and any static file (path containing a dot,
  // e.g. /images/logo/auth-logo.svg) so public assets aren't auth-redirected.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\..*).*)"],
};
