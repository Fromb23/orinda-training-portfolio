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

  it("uses route context for assignment recovery and a neutral global fallback", async () => {
    const shared = await read("src/components/NotFoundPage.tsx");
    const global = await read("src/app/not-found.tsx");
    const portfolio = await read("src/app/portfolio/assignments/[id]/not-found.tsx");
    const management = await read("src/app/manage/assignments/[id]/not-found.tsx");
    expect(shared).toContain("Page not found");
    expect(global).toContain('action="Back to home" destination="/"');
    expect(global).not.toContain("getSession");
    expect(portfolio).toContain('action="Back to portfolio" destination="/portfolio"');
    expect(management).toContain('action="Back to assignments" destination="/manage"');
  });

  it("turns a deleted management assignment into the framework 404", async () => {
    const page = await read("src/app/manage/assignments/[id]/page.tsx");
    expect(page).toContain("error.status===404)notFound()");
    expect(page.indexOf('getSession("MANAGEMENT")')).toBeLessThan(page.lastIndexOf("managementAssignment"));
  });

  it("turns a missing published assignment into the route-scoped framework 404", async () => {
    const page = await read("src/app/portfolio/assignments/[id]/page.tsx");
    expect(page).toContain("if (!item?.publishedRevision) notFound()");
    expect(page.indexOf('getSession("SUPERVISOR")')).toBeLessThan(page.lastIndexOf("notFound()"));
  });

  it("uses the original only after a missing thumbnail", async () => {
    const thumbnail = await read("src/components/FileThumbnail.tsx");
    expect(thumbnail).toContain('response.status === 404');
    expect(thumbnail).toContain('fetch(`/api/files/${attachmentId}`');
    expect(thumbnail).toContain("Original preview");
  });
});
