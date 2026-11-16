import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireSession, findUnique } = vi.hoisted(() => ({ requireSession: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSession, secretHash: (token: string) => `hash:${token}`, safeHashEqual: (left: string, right: string) => left === right }));
vi.mock("@/lib/db", () => ({ db: { credential: { findUnique } } }));

import { GET } from "../src/app/api/manage/share-link/route";

const origin = "https://orinda-training.scholaroscope.com";
const token = "s".repeat(43);

describe("configured supervisor share link", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin); vi.stubEnv("SUPERVISOR_SHARE_URL", `${origin}/access/supervisor?token=${token}`); requireSession.mockReset().mockResolvedValue({ role: "MANAGEMENT" }); findUnique.mockReset().mockResolvedValue({ tokenHash: `hash:${token}` }); });
  afterEach(() => vi.unstubAllEnvs());

  it("returns the complete canonical current bearer link", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ link: `${origin}/access/supervisor?token=${token}`, configured: true });
  });

  it("rejects an outdated link after credential rotation", async () => {
    findUnique.mockResolvedValue({ tokenHash: "hash:a-new-token" });
    const response = await GET(); const body = await response.json();
    expect(response.status).toBe(500); expect(body.error).toMatch(/outdated/);
  });

  it("rejects a non-canonical or truncated configured link", async () => {
    vi.stubEnv("SUPERVISOR_SHARE_URL", "https://attacker.example/access/supervisor?token=short");
    const response = await GET();
    expect(response.status).toBe(500); expect(findUnique).not.toHaveBeenCalled();
  });
});
