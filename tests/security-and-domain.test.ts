import { describe, expect, it } from "vitest";
import { assertPublishable, canMutate, canReadRevision } from "../src/lib/policy";
import { sessionIsCurrent, validateOrder } from "../src/lib/security-core";
import { ALLOWED_TYPES } from "../src/lib/config";

describe("server-side access policy", () => {
  it("denies unauthenticated access", () => { expect(canReadRevision(null, true)).toBe(false); expect(canMutate(null)).toBe(false); });
  it("allows supervisors to see only published revisions and never mutate", () => { expect(canReadRevision("SUPERVISOR", true)).toBe(true); expect(canReadRevision("SUPERVISOR", false)).toBe(false); expect(canMutate("SUPERVISOR")).toBe(false); });
  it("lets management access drafts and mutations", () => { expect(canReadRevision("MANAGEMENT", false)).toBe(true); expect(canMutate("MANAGEMENT")).toBe(true); });
});

describe("publication and ordered attachments", () => {
  it("requires a title and a successfully stored attachment", () => { expect(() => assertPublishable("", 1)).toThrow(/title/); expect(() => assertPublishable("Work", 0)).toThrow(/attachment/); expect(() => assertPublishable("Work", 2)).not.toThrow(); });
  it("accepts exact multi-file reordering and rejects omissions or duplicates", () => { expect(validateOrder(["a","b","c"],["c","a","b"])).toBe(true); expect(validateOrder(["a","b"],["a"])).toBe(false); expect(validateOrder(["a","b"],["a","a"])).toBe(false); });
  it("has an explicit actual-content allowlist", () => { expect([...ALLOWED_TYPES.keys()]).toEqual(["image/jpeg","image/png","image/webp","application/pdf"]); expect(ALLOWED_TYPES.has("text/html")).toBe(false); });
});

describe("token rotation", () => {
  const future = new Date("2030-01-02T00:00:00Z"); const now = new Date("2030-01-01T00:00:00Z");
  it("invalidates sessions derived from the previous credential version", () => { expect(sessionIsCurrent({ role:"SUPERVISOR",credentialVersion:1,expiresAt:future },{ role:"SUPERVISOR",version:1 },now)).toBe(true); expect(sessionIsCurrent({ role:"SUPERVISOR",credentialVersion:1,expiresAt:future },{ role:"SUPERVISOR",version:2 },now)).toBe(false); });
  it("rejects expired and cross-role sessions", () => { expect(sessionIsCurrent({ role:"MANAGEMENT",credentialVersion:1,expiresAt:now },{ role:"MANAGEMENT",version:1 },now)).toBe(false); expect(sessionIsCurrent({ role:"SUPERVISOR",credentialVersion:1,expiresAt:future },{ role:"MANAGEMENT",version:1 },now)).toBe(false); });
});
