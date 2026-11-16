import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("publish and portfolio UI regressions", () => {
  it("uses one editor, uploads automatically, and saves current fields before direct publication", async () => {
    const editor = await read("src/components/AssignmentEditor.tsx");
    const dashboard = await read("src/components/ManageDashboard.tsx");
    expect(dashboard).toContain('href="/manage/assignments/new"');
    expect(dashboard).toContain("New assignment");
    expect(dashboard).not.toContain("Create draft");
    expect(editor).toContain("void uploadOne(item)");
    expect(editor).toContain("createPromise.current");
    expect(editor).toContain("publishAttempt.current");
    expect(editor).toContain("draftRevisionId: publishAttempt.current");
    expect(editor).toContain("input.value = \"\"");
    expect(editor).toContain('finish("save")');
    expect(editor).toContain('finish("publish")');
    expect(editor).toContain("attachmentOrder: files.map");
    expect(editor.indexOf('"PATCH", { title, description')).toBeLessThan(editor.indexOf("/publish`"));
    expect(editor).not.toContain("Upload selected files");
    expect(editor).not.toContain("Save the draft before publishing");
    expect(editor).not.toMatch(/finalBlocked\s*=.*dirty/);
    expect(editor).toContain('"/manage?published=1" : "/manage?saved=1"');
    expect(dashboard).toContain("Assignment published successfully");
  });

  it("keeps temporary records private and cleans only explicitly temporary work", async () => {
    const page = await read("src/app/manage/page.tsx");
    const assignments = await read("src/lib/assignments.ts");
    const cleanup = await read("scripts/cleanup-storage.ts");
    expect(page).toContain("where:{isTemporary:false}");
    expect(assignments).toContain("deleteTemporaryAssignment");
    expect(assignments).toContain("deleteMany({ where: { id, isTemporary: true } })");
    expect(cleanup).toContain("isTemporary: true");
  });

  it("keeps only about and assignments navigation with absolute portfolio anchors", async () => {
    const page = await read("src/app/portfolio/page.tsx");
    expect(page).not.toContain("Teaching experience"); expect(page).not.toContain("Education & leadership"); expect(page).not.toContain("Student leadership");
    const header = await read("src/components/PortfolioHeader.tsx");
    expect(header).toContain('href="/portfolio#about"'); expect(header).toContain('href="/portfolio#assignments"'); expect(header).not.toContain("experience");
  });

  it("provides ordered selection, paging, zoom, PDF fallback, and responsive review layout", async () => {
    const viewer = await read("src/components/AttachmentView.tsx");
    expect(viewer).toContain("File {activeIndex + 1} of {attachments.length}"); expect(viewer).toContain("Show previous file"); expect(viewer).toContain("Image zoom controls"); expect(viewer).toContain("Inline PDF support varies by browser"); expect(viewer).toContain("attachments.map");
    expect(viewer).toContain("URL.createObjectURL(blob)"); expect(viewer).toContain('response.status === 404');
    expect(viewer).toContain("File not found"); expect(viewer).toContain("Session expired"); expect(viewer).toContain("Preview temporarily unavailable");
    const css = await read("src/app/globals.css");
    expect(css).toContain("@media(max-width:900px)"); expect(css).toContain(".review-workspace{grid-template-columns:1fr");
  });

  it("isolates hero role typography and keeps assignment metadata compact", async () => {
    const page = await read("src/app/portfolio/page.tsx");
    const detail = await read("src/app/portfolio/assignments/[id]/page.tsx");
    const viewer = await read("src/components/AttachmentView.tsx");
    const css = await read("src/app/globals.css");
    expect(page).toContain('className="hero-role"');
    expect(css).toMatch(/\.hero h1 \.hero-role\{[^}]*line-height:1\.35[^}]*letter-spacing:normal/);
    expect(detail).toContain('className="publication-date"');
    expect(detail).not.toContain('className="assignment-facts"');
    expect(detail).not.toContain("Latest file upload");
    expect(detail).not.toContain("Total size");
    expect(viewer).toContain('className="file-metadata"');
    expect(viewer).toContain("Uploaded <time");
  });
});
