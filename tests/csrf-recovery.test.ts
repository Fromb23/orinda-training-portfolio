import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieValues, findUnique, update } = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieValues.has(name) ? { value: cookieValues.get(name)! } : undefined }),
}));
vi.mock("@/lib/db", () => ({ db: { session: { findUnique, update } } }));

import { csrfTokenForSession, requireCsrf, secretHash } from "../src/lib/auth";
import { POST as recover } from "../src/app/api/manage/csrf/route";

const origin = "https://portfolio.example";
const sessionToken = "management-session-token";

function currentSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "management-session-id",
    sessionHash: secretHash(sessionToken),
    csrfHash: secretHash("old-csrf-token"),
    role: "MANAGEMENT",
    credentialId: "management-credential",
    credentialVersion: 4,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    credential: { id: "management-credential", role: "MANAGEMENT", version: 4, tokenHash: "0".repeat(64), createdAt: new Date(), rotatedAt: new Date() },
    ...overrides,
  };
}

function request(path = "/api/manage/csrf", requestOrigin = origin) {
  return new Request(`${origin}${path}`, { method: "POST", headers: { origin: requestOrigin, "sec-fetch-site": requestOrigin === origin ? "same-origin" : "cross-site" } });
}

describe("management CSRF validation and recovery", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_HASH_KEY", "test-key-that-is-longer-than-thirty-two-characters");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
    vi.stubEnv("NODE_ENV", "production");
    cookieValues.clear();
    cookieValues.set("orinda_management_session", sessionToken);
    findUnique.mockReset().mockResolvedValue(currentSession());
    update.mockReset().mockResolvedValue(currentSession());
  });

  afterEach(() => vi.unstubAllEnvs());

  it("marks missing and stale CSRF values with the explicit pre-mutation rejection code", async () => {
    await expect(requireCsrf(request("/api/manage/assignments"))).rejects.toMatchObject({ status: 403, code: "CSRF_INVALID" });
    cookieValues.set("orinda_management_csrf", "stale-browser-token");
    await expect(requireCsrf(new Request(`${origin}/api/manage/assignments`, { method: "POST", headers: { origin, "x-csrf-token": "stale-browser-token" } }))).rejects.toMatchObject({ status: 403, code: "CSRF_INVALID" });
  });

  it("continues to accept a matching legacy CSRF cookie for a valid legacy management session", async () => {
    cookieValues.set("orinda_csrf", "old-csrf-token");
    await expect(requireCsrf(new Request(`${origin}/api/manage/assignments`, { method: "POST", headers: { origin, "x-csrf-token": "old-csrf-token" } }))).resolves.toMatchObject({ role: "MANAGEMENT" });
  });

  it("reissues one stable session-bound token for concurrent recoveries", async () => {
    const [first, second] = await Promise.all([recover(request()), recover(request())]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const expected = csrfTokenForSession("management-session-id");
    expect(first.headers.getSetCookie().join(";")).toContain(`orinda_management_csrf=${expected}`);
    expect(second.headers.getSetCookie().join(";")).toContain(`orinda_management_csrf=${expected}`);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.every(([value]) => value.data.csrfHash === secretHash(expected))).toBe(true);
  });

  it("does not write again when the session already uses its recoverable token", async () => {
    const token = csrfTokenForSession("management-session-id");
    findUnique.mockResolvedValue(currentSession({ csrfHash: secretHash(token) }));
    const response = await recover(request());
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects cross-origin recovery without CORS or token exposure", async () => {
    const response = await recover(request("/api/manage/csrf", "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1) }],
    ["revoked", { credentialVersion: 3 }],
    ["wrong role", { role: "SUPERVISOR" }],
  ])("does not recover an %s management session", async (_label, overrides) => {
    findUnique.mockResolvedValue(currentSession(overrides));
    const response = await recover(request());
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("never accepts the supervisor role cookie as management recovery authentication", async () => {
    cookieValues.clear();
    cookieValues.set("orinda_supervisor_session", "supervisor-token");
    const response = await recover(request());
    expect(response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
