import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AccessRole, Session } from "@/generated/prisma/client";
import { db } from "./db";
import { config } from "./config";
import { HttpError } from "./http";
import { sessionIsCurrent } from "./security-core";
import { canonicalSiteOrigin } from "./site-url";

export const SESSION_COOKIE = "orinda_session";
export const CSRF_COOKIE = "orinda_csrf";

function key() {
  const value = process.env.TOKEN_HASH_KEY;
  if (!value || value.length < 32) throw new Error("TOKEN_HASH_KEY must contain at least 32 characters");
  return value;
}

export function secretHash(value: string) {
  return createHmac("sha256", key()).update(value).digest("hex");
}

export function safeHashEqual(expected: string, actual: string) {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function randomToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }

export async function exchangeToken(role: AccessRole, token: string) {
  if (token.length < 40) throw new HttpError(401, "Invalid access link.");
  const credential = await db.credential.findUnique({ where: { role } });
  if (!credential || !safeHashEqual(credential.tokenHash, secretHash(token))) throw new HttpError(401, "Invalid access link.");
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + config.sessionHours * 3_600_000);
  await db.session.create({ data: {
    sessionHash: secretHash(sessionToken), csrfHash: secretHash(csrfToken), role,
    credentialId: credential.id, credentialVersion: credential.version, expiresAt,
  }});
  return { sessionToken, csrfToken, expiresAt };
}

export type ValidSession = Session;

export async function getSession(requiredRole?: AccessRole): Promise<ValidSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { sessionHash: secretHash(token) }, include: { credential: true } });
  if (!session || !sessionIsCurrent(session, session.credential)) return null;
  if (requiredRole && session.role !== requiredRole) return null;
  return session;
}

export async function requireSession(role?: AccessRole) {
  const session = await getSession(role);
  if (!session) throw new HttpError(401, "Authorisation required.");
  return session;
}

export async function requireCsrf(request: Request, role: AccessRole = "MANAGEMENT") {
  const session = await requireSession(role);
  const cookieToken = (await cookies()).get(CSRF_COOKIE)?.value ?? "";
  const headerToken = request.headers.get("x-csrf-token") ?? "";
  if (!cookieToken || cookieToken !== headerToken || !safeHashEqual(session.csrfHash, secretHash(headerToken))) throw new HttpError(403, "Invalid CSRF token. Refresh the page and try again.");
  const origin = request.headers.get("origin");
  if (origin && origin !== canonicalSiteOrigin()) throw new HttpError(403, "Cross-origin mutation denied.");
  return session;
}

export function sessionCookieOptions(expires: Date, httpOnly: boolean) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", expires };
}
