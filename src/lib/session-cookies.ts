import type { AccessRole } from "@/generated/prisma/client";

export const LEGACY_SESSION_COOKIE = "orinda_session";
export const LEGACY_CSRF_COOKIE = "orinda_csrf";
export const SESSION_COOKIES: Record<AccessRole, string> = {
  MANAGEMENT: "orinda_management_session",
  SUPERVISOR: "orinda_supervisor_session",
};
export const CSRF_COOKIES: Record<AccessRole, string> = {
  MANAGEMENT: "orinda_management_csrf",
  SUPERVISOR: "orinda_supervisor_csrf",
};

export function sessionCookieOptions(expires: Date, httpOnly: boolean) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires };
}
