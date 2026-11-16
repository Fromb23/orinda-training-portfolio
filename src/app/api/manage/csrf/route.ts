import { NextResponse } from "next/server";
import {
  CSRF_COOKIES,
  csrfTokenForSession,
  requireSameOrigin,
  requireSession,
  secretHash,
  sessionCookieOptions,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await requireSession("MANAGEMENT");
    const token = csrfTokenForSession(session.id);
    const csrfHash = secretHash(token);
    if (session.csrfHash !== csrfHash) {
      await db.session.update({ where: { id: session.id }, data: { csrfHash } });
    }
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set(CSRF_COOKIES.MANAGEMENT, token, sessionCookieOptions(session.expiresAt, false));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
