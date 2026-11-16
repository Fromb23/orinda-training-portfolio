import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const privateFile = request.nextUrl.pathname.startsWith("/api/files/");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, noimageindex");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", privateFile ? "SAMEORIGIN" : "DENY");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", `default-src 'self'; img-src 'self' data: blob:; frame-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'self'; base-uri 'none'; frame-ancestors ${privateFile ? "'self'" : "'none'"}; form-action 'self'`);
  return response;
}

export const config = { matcher: "/:path*" };
