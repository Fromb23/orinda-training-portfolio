import { AccessRole } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { CSRF_COOKIE, exchangeToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { canonicalSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: value } = await params;
  const role = value === "management" ? AccessRole.MANAGEMENT : value === "supervisor" ? AccessRole.SUPERVISOR : null;
  const cleanUrl = canonicalSiteUrl(role === AccessRole.MANAGEMENT ? "/manage" : role === AccessRole.SUPERVISOR ? "/portfolio" : "/");
  if (!role) return privateRedirect(cleanUrl);
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const session = await exchangeToken(role, token);
    const response = privateRedirect(cleanUrl, 303);
    response.cookies.set(SESSION_COOKIE, session.sessionToken, sessionCookieOptions(session.expiresAt, true));
    response.cookies.set(CSRF_COOKIE, session.csrfToken, sessionCookieOptions(session.expiresAt, false));
    return response;
  } catch {
    return privateRedirect(canonicalSiteUrl("/?access=invalid"), 303);
  }
}

function privateRedirect(url: URL, status?: 303) {
  const response = NextResponse.redirect(url, status);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
