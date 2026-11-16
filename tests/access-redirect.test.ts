import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeToken } = vi.hoisted(() => ({ exchangeToken: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  CSRF_COOKIE: "orinda_csrf",
  SESSION_COOKIE: "orinda_session",
  exchangeToken,
  sessionCookieOptions: (expires: Date, httpOnly: boolean) => ({
    expires,
    httpOnly,
    path: "/",
    sameSite: "strict" as const,
    secure: true,
  }),
}));

import { GET } from "../src/app/access/[role]/route";
import { canonicalSiteOrigin } from "../src/lib/site-url";

const canonicalOrigin = "https://orinda-training.scholaroscope.com";
const session = {
  sessionToken: "session-token",
  csrfToken: "csrf-token",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};

function accessRequest(internalOrigin: string, role: string, headers?: HeadersInit) {
  return new Request(`${internalOrigin}/access/${role}?token=${"a".repeat(43)}`, { headers });
}

async function redirect(role: string, internalOrigin = "http://localhost:3011", headers?: HeadersInit) {
  return GET(accessRequest(internalOrigin, role, headers), { params: Promise.resolve({ role }) });
}

describe("access redirects behind a reverse proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", canonicalOrigin);
    exchangeToken.mockReset();
    exchangeToken.mockResolvedValue(session);
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["management", "http://localhost:3011", "/manage", "MANAGEMENT"],
    ["supervisor", "http://127.0.0.1:3011", "/portfolio", "SUPERVISOR"],
  ])("redirects successful %s access from the internal origin to its canonical path", async (role, internalOrigin, path, expectedRole) => {
    const response = await redirect(role, internalOrigin);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${canonicalOrigin}${path}`);
    expect(response.headers.get("location")).not.toContain("token=");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(exchangeToken).toHaveBeenCalledWith(expectedRole, "a".repeat(43));
    expect(response.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringContaining("orinda_session=session-token"),
      expect.stringContaining("orinda_csrf=csrf-token"),
    ]));
  });

  it("keeps invalid-token redirects on the canonical origin", async () => {
    exchangeToken.mockRejectedValue(new Error("invalid token"));

    const response = await redirect("management", "http://127.0.0.1:3011");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${canonicalOrigin}/?access=invalid`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps invalid-role redirects on the canonical origin", async () => {
    const response = await redirect("administrator");

    expect(response.headers.get("location")).toBe(`${canonicalOrigin}/`);
    expect(exchangeToken).not.toHaveBeenCalled();
  });

  it("ignores spoofed host and forwarded headers", async () => {
    const response = await redirect("supervisor", "http://localhost:3011", {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
      forwarded: "host=attacker.example;proto=https",
    });

    expect(response.headers.get("location")).toBe(`${canonicalOrigin}/portfolio`);
  });
});

describe("canonical site origin validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails clearly when the production origin is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    await expect(redirect("management")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL is required in production/);
  });

  it.each([
    ["http://example.com", /HTTPS in production/],
    ["https://user:password@example.com", /credentials/],
    ["https://example.com/subpath", /without a path/],
    ["https://example.com?source=test", /query string or fragment/],
    ["https://example.com?", /query string or fragment/],
    ["https://example.com#section", /query string or fragment/],
    ["https://example.com#", /query string or fragment/],
    ["ftp://example.com", /HTTP or HTTPS/],
    ["not a URL", /absolute HTTP\(S\) URL/],
  ])("rejects invalid production origin %s", (configured, message) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", configured);

    expect(() => canonicalSiteOrigin()).toThrow(message);
  });

  it("permits an explicitly configured localhost HTTP origin in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    exchangeToken.mockReset();
    exchangeToken.mockResolvedValue(session);

    const response = await redirect("supervisor", "http://127.0.0.1:3011");

    expect(response.headers.get("location")).toBe("http://localhost:3000/portfolio");
  });
});
