import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieValues, findUnique } = vi.hoisted(() => ({ cookieValues: new Map<string, string>(), findUnique: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => cookieValues.has(name) ? { value: cookieValues.get(name)! } : undefined }) }));
vi.mock("@/lib/db", () => ({ db: { session: { findUnique } } }));

import { getSession, secretHash } from "../src/lib/auth";

function session(role: "MANAGEMENT" | "SUPERVISOR", token: string) {
  return { id: `${role}-session`, sessionHash: secretHash(token), csrfHash: "0".repeat(64), role, credentialId: `${role}-credential`, credentialVersion: 4, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), credential: { id: `${role}-credential`, role, version: 4, tokenHash: "0".repeat(64), createdAt: new Date(), rotatedAt: new Date() } };
}

describe("role-specific sessions", () => {
  beforeEach(() => { vi.stubEnv("TOKEN_HASH_KEY", "test-key-that-is-longer-than-thirty-two-characters"); cookieValues.clear(); findUnique.mockReset(); });

  it("resolves management and supervisor cookies independently in the same browser", async () => {
    const management = session("MANAGEMENT", "management-token"); const supervisor = session("SUPERVISOR", "supervisor-token");
    cookieValues.set("orinda_management_session", "management-token"); cookieValues.set("orinda_supervisor_session", "supervisor-token");
    findUnique.mockImplementation(({ where }: { where: { sessionHash: string } }) => Promise.resolve(where.sessionHash === management.sessionHash ? management : supervisor));
    await expect(getSession("MANAGEMENT")).resolves.toMatchObject({ role: "MANAGEMENT" });
    await expect(getSession("SUPERVISOR")).resolves.toMatchObject({ role: "SUPERVISOR" });
  });

  it("never treats a legacy supervisor cookie as management access", async () => {
    const supervisor = session("SUPERVISOR", "legacy-token"); cookieValues.set("orinda_session", "legacy-token"); findUnique.mockResolvedValue(supervisor);
    await expect(getSession("MANAGEMENT")).resolves.toBeNull();
    await expect(getSession("SUPERVISOR")).resolves.toMatchObject({ role: "SUPERVISOR" });
  });

  it("rejects an expired role-specific session", async () => {
    const supervisor = session("SUPERVISOR", "expired-token"); supervisor.expiresAt = new Date(Date.now() - 1); cookieValues.set("orinda_supervisor_session", "expired-token"); findUnique.mockResolvedValue(supervisor);
    await expect(getSession("SUPERVISOR")).resolves.toBeNull();
  });
});
