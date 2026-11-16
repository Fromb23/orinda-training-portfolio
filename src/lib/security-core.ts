import type { AccessRole } from "@/generated/prisma/client";

export function sessionIsCurrent(session: { role: AccessRole; credentialVersion: number; expiresAt: Date }, credential: { role: AccessRole; version: number }, now = new Date()) {
  return session.expiresAt > now && session.role === credential.role && session.credentialVersion === credential.version;
}

export function validateOrder(current: string[], proposed: string[]) {
  return proposed.length === current.length && new Set(proposed).size === proposed.length && proposed.every((id) => current.includes(id));
}
