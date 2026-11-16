import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http";
import { openStored } from "../src/lib/storage";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("not-found and unavailable-file UX", () => {
  it("maps an absent original storage object to a real 404", async () => {
    await expect(openStored(`${randomUUID()}.pdf`)).rejects.toMatchObject({ status: 404, message: "File not found." } satisfies Partial<HttpError>);
  });

  it("keeps the page 404 visible and selects home by authenticated role", async () => {
    const page = await read("src/app/not-found.tsx");
    expect(page).toContain("Page not found");
    expect(page).toContain('session?.role === "MANAGEMENT" ? "/manage"');
    expect(page).toContain('session?.role === "SUPERVISOR" ? "/portfolio" : "/"');
    expect(page).toContain("Back to home");
    expect(page).not.toContain("redirect(");
  });

  it("turns a deleted management assignment into the framework 404", async () => {
    const page = await read("src/app/manage/assignments/[id]/page.tsx");
    expect(page).toContain("error.status===404)notFound()");
    expect(page.indexOf('getSession("MANAGEMENT")')).toBeLessThan(page.lastIndexOf("managementAssignment"));
  });

  it("uses the original only after a missing thumbnail", async () => {
    const thumbnail = await read("src/components/FileThumbnail.tsx");
    expect(thumbnail).toContain('response.status === 404');
    expect(thumbnail).toContain('fetch(`/api/files/${attachmentId}`');
    expect(thumbnail).toContain("Original preview");
  });
});
