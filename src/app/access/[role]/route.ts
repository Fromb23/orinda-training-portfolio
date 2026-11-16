import { AccessRole } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { CSRF_COOKIE, exchangeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: value } = await params;
  const role = value === "management" ? AccessRole.MANAGEMENT : value === "supervisor" ? AccessRole.SUPERVISOR : null;
  const cleanUrl = new URL(role === AccessRole.MANAGEMENT ? "/manage" : role === AccessRole.SUPERVISOR ? "/portfolio" : "/", request.url);
  if (!role) return NextResponse.redirect(cleanUrl);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const session = await exchangeToken(role, token);
    const response = NextResponse.redirect(cleanUrl, 303);
    response.cookies.set(SESSION_COOKIE, session.sessionToken, sessionCookieOptions(session.expiresAt, true));
    response.cookies.set(CSRF_COOKIE, session.csrfToken, sessionCookieOptions(session.expiresAt, false));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?access=invalid", request.url), 303);
  }
}
