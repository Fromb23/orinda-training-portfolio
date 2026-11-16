import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, findUnique, openStored } = vi.hoisted(() => ({ getSession: vi.fn(), findUnique: vi.fn(), openStored: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/lib/db", () => ({ db: { attachment: { findUnique } } }));
vi.mock("@/lib/storage", () => ({ openStored }));

import { GET } from "../src/app/api/files/[attachmentId]/route";

const attachment = { id: "file-1", originalName: "work.pdf", mimeType: "application/pdf", storageKey: "stored.pdf", thumbnailKey: null, revision: { publishedFor: null } };
const request = () => new Request("https://orinda-training.scholaroscope.com/api/files/file-1");
const params = { params: Promise.resolve({ attachmentId: "file-1" }) };

describe("private file route authorization", () => {
  beforeEach(() => { getSession.mockReset(); findUnique.mockReset(); openStored.mockReset(); findUnique.mockResolvedValue(attachment); openStored.mockResolvedValue({ stream: Readable.from(Buffer.from("pdf")), size: 3 }); });

  it("conceals working-revision files from a supervisor", async () => {
    getSession.mockResolvedValue({ role: "SUPERVISOR" });
    const response = await GET(request(), params);
    expect(response.status).toBe(404); expect(openStored).not.toHaveBeenCalled();
  });

  it("serves only a published file to a supervisor", async () => {
    getSession.mockResolvedValue({ role: "SUPERVISOR" }); findUnique.mockResolvedValue({ ...attachment, revision: { publishedFor: { id: "assignment-1" } } });
    const response = await GET(request(), params);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("application/pdf"); expect(await response.text()).toBe("pdf");
  });

  it("allows management to read a working-revision file", async () => {
    getSession.mockResolvedValue({ role: "MANAGEMENT" });
    expect((await GET(request(), params)).status).toBe(200);
  });
});
