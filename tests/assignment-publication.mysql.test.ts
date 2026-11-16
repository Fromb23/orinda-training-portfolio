import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.ORINDA_TEST_DATABASE_URL;
const mysql = describe.skipIf(!testDatabaseUrl);

mysql("assignment publication through Prisma/MySQL", () => {
  let uploadDir: string;
  let assignmentId: string;
  let db: typeof import("../src/lib/db")["db"];
  let assignments: typeof import("../src/lib/assignments");

  beforeAll(async () => {
    const url = new URL(testDatabaseUrl!);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!/(^|[_-])test([_-]|$)/i.test(database)) throw new Error("ORINDA_TEST_DATABASE_URL must name a dedicated test database");
    process.env.DATABASE_URL = testDatabaseUrl;
    uploadDir = await mkdtemp(path.join(tmpdir(), "orinda-publication-"));
    process.env.UPLOAD_DIR = uploadDir;
    ({ db } = await import("../src/lib/db"));
    assignments = await import("../src/lib/assignments");
  });

  afterAll(async () => {
    if (assignmentId && db) await db.assignment.delete({ where: { id: assignmentId } }).catch(() => undefined);
    if (db) await db.$disconnect();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it("clones ordered PDF attachments, keeps snapshots private, republishes, and rolls back failures", async () => {
    const created = await assignments.createAssignment("Published version");
    assignmentId = created.id;
    const firstUploadedAt = new Date("2026-01-01T10:00:00.123Z");
    const secondUploadedAt = new Date("2026-01-02T11:00:00.456Z");
    const files = ["first.pdf", "second.pdf"];
    await Promise.all(files.map((name) => writeFile(path.join(uploadDir, name), "%PDF-1.4\n%%EOF")));

    const first = await assignments.addAttachment(assignmentId, {
      storageKey: files[0], thumbnailKey: null, originalName: "first.pdf", mimeType: "application/pdf",
      sizeBytes: 15, sha256: "a".repeat(64), width: null, height: null, uploadId: "upload-first-0000000001",
    });
    const second = await assignments.addAttachment(assignmentId, {
      storageKey: files[1], thumbnailKey: null, originalName: "second.pdf", mimeType: "application/pdf",
      sizeBytes: 15, sha256: "b".repeat(64), width: null, height: null, uploadId: "upload-second-000000002",
    });
    await db.attachment.update({ where: { id: first.id }, data: { uploadedAt: firstUploadedAt } });
    await db.attachment.update({ where: { id: second.id }, data: { uploadedAt: secondUploadedAt } });
    await assignments.reorderAttachments(assignmentId, [second.id, first.id]);

    await assignments.publishAssignment(assignmentId);
    let persisted = await assignments.managementAssignment(assignmentId);
    const publishedOne = persisted.publishedRevision!;
    const draftTwo = persisted.draftRevision!;
    await expect(assignments.publishAssignment(assignmentId, publishedOne.id)).resolves.toMatchObject({ duplicate: true });
    expect((await assignments.managementAssignment(assignmentId)).draftRevision!.id).toBe(draftTwo.id);
    expect(publishedOne.attachments.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(draftTwo.attachments.map((item) => item.id)).not.toEqual([second.id, first.id]);
    expect(new Set(draftTwo.attachments.map((item) => item.id)).size).toBe(2);
    expect(draftTwo.attachments.every((item) => item.revisionId === draftTwo.id)).toBe(true);
    expect(draftTwo.attachments.map((item) => item.position)).toEqual([0, 1]);
    expect(draftTwo.attachments.map((item) => item.uploadId)).toEqual(["upload-second-000000002", "upload-first-0000000001"]);
    expect(draftTwo.attachments.map((item) => item.uploadedAt)).toEqual([secondUploadedAt, firstUploadedAt]);
    expect(draftTwo.attachments.map((item) => item.storageKey)).toEqual([...files].reverse());
    expect(await assignments.existingUpload(assignmentId, "upload-second-000000002")).toMatchObject({ id: draftTwo.attachments[0].id });

    await assignments.updateDraft(assignmentId, { title: "Private draft edit" });
    persisted = await assignments.managementAssignment(assignmentId);
    expect(persisted.publishedRevision!.title).toBe("Published version");
    expect(persisted.draftRevision!.title).toBe("Private draft edit");

    await assignments.publishAssignment(assignmentId);
    persisted = await assignments.managementAssignment(assignmentId);
    expect(persisted.publishedRevision!.id).toBe(draftTwo.id);
    expect(persisted.publishedRevision!.title).toBe("Private draft edit");
    expect(await db.revision.findUniqueOrThrow({ where: { id: publishedOne.id } })).toMatchObject({ state: "RETIRED" });

    const currentDraft = persisted.draftRevision!;
    const shared = currentDraft.attachments[0];
    await assignments.removeDraftAttachment(assignmentId, shared.id);
    await expect(stat(path.join(uploadDir, shared.storageKey))).resolves.toBeDefined();
    expect(await db.attachment.count({ where: { storageKey: shared.storageKey } })).toBeGreaterThan(0);

    await db.revision.create({ data: {
      assignmentId, number: currentDraft.number + 1, state: "RETIRED", title: "Force next publication to fail",
    } });
    const beforeFailure = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    await expect(assignments.publishAssignment(assignmentId)).rejects.toThrow();
    const afterFailure = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(afterFailure.publishedRevisionId).toBe(beforeFailure.publishedRevisionId);
    expect(afterFailure.draftRevisionId).toBe(beforeFailure.draftRevisionId);
    expect(await db.revision.findUniqueOrThrow({ where: { id: beforeFailure.publishedRevisionId! } })).toMatchObject({ state: "PUBLISHED" });
    expect(await db.revision.findUniqueOrThrow({ where: { id: beforeFailure.draftRevisionId! } })).toMatchObject({ state: "WORKING", publishedAt: null });
  });
});
