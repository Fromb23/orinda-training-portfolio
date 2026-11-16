import { AccessRole } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { CSRF_COOKIES, exchangeToken, SESSION_COOKIES, sessionCookieOptions } from "@/lib/auth";
import { HttpError } from "@/lib/http";
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
    response.cookies.set(SESSION_COOKIES[role], session.sessionToken, sessionCookieOptions(session.expiresAt, true));
    response.cookies.set(CSRF_COOKIES[role], session.csrfToken, sessionCookieOptions(session.expiresAt, false));
    return response;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    return privateRedirect(canonicalSiteUrl(`/?access=invalid&role=${value}`), 303);
  }
}

function privateRedirect(url: URL, status?: 303) {
  const response = NextResponse.redirect(url, status);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
