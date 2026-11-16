import { Prisma, RevisionState } from "@/generated/prisma/client";
import { db } from "./db";
import { config } from "./config";
import { HttpError } from "./http";
import { assertPublishable } from "./policy";
import { removeStored } from "./storage";
import { validateOrder } from "./security-core";
import { buildPublication } from "./publication-core";

const attachmentOrder = { position: "asc" as const };

export async function createAssignment(title: string, description?: string | null) {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new HttpError(400, "Title is required and must be at most 200 characters.");
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({ data: {} });
    const draft = await tx.revision.create({ data: { assignmentId: assignment.id, number: 1, title: cleanTitle, description: cleanDescription(description) } });
    return tx.assignment.update({ where: { id: assignment.id }, data: { draftRevisionId: draft.id }, include: { draftRevision: { include: { attachments: { orderBy: attachmentOrder } } }, publishedRevision: true } });
  });
}

function cleanDescription(value?: string | null) {
  if (value == null || !value.trim()) return null;
  if (value.length > 20_000) throw new HttpError(400, "Description must be at most 20,000 characters.");
  return value.trim();
}

export async function managementAssignment(id: string) {
  const assignment = await db.assignment.findUnique({ where: { id }, include: {
    draftRevision: { include: { attachments: { orderBy: attachmentOrder } } },
    publishedRevision: { include: { attachments: { orderBy: attachmentOrder } } },
  }});
  if (!assignment?.draftRevision) throw new HttpError(404, "Assignment not found.");
  return assignment;
}

export async function updateDraft(id: string, data: { title?: unknown; description?: unknown }) {
  const assignment = await managementAssignment(id);
  const draft = assignment.draftRevision!;
  const title = typeof data.title === "string" ? data.title.trim() : draft.title;
  if (!title || title.length > 200) throw new HttpError(400, "Title is required and must be at most 200 characters.");
  if (data.description !== undefined && data.description !== null && typeof data.description !== "string") throw new HttpError(400, "Description must be plain text.");
  await db.revision.update({ where: { id: draft.id }, data: { title, description: data.description === undefined ? undefined : cleanDescription(data.description as string | null) } });
  await db.assignment.update({ where: { id }, data: { updatedAt: new Date() } });
  return managementAssignment(id);
}

export async function publishAssignment(id: string) {
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({ where: { id }, include: { draftRevision: { include: { attachments: { orderBy: attachmentOrder } } }, publishedRevision: true } });
    if (!assignment?.draftRevision) throw new HttpError(404, "Assignment not found.");
    try { assertPublishable(assignment.draftRevision.title, assignment.draftRevision.attachments.length); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const now = new Date();
    const snapshot = buildPublication(assignment.draftRevision, now);
    if (assignment.publishedRevisionId) await tx.revision.update({ where: { id: assignment.publishedRevisionId }, data: { state: RevisionState.RETIRED } });
    await tx.revision.update({ where: { id: assignment.draftRevision.id }, data: { state: RevisionState.PUBLISHED, publishedAt: now } });
    const nextDraft = await tx.revision.create({ data: {
      assignmentId: id, number: snapshot.nextNumber, title: snapshot.title, description: snapshot.description,
      attachments: { create: snapshot.attachments },
    }});
    await tx.assignment.update({ where: { id }, data: { publishedRevisionId: assignment.draftRevision.id, draftRevisionId: nextDraft.id } });
    return { publishedAt: now, revision: assignment.draftRevision.number };
  });
}

export async function unpublishAssignment(id: string) {
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({ where: { id } });
    if (!assignment) throw new HttpError(404, "Assignment not found.");
    if (assignment.publishedRevisionId) await tx.revision.update({ where: { id: assignment.publishedRevisionId }, data: { state: RevisionState.RETIRED } });
    await tx.assignment.update({ where: { id }, data: { publishedRevisionId: null } });
  });
}

export async function deleteAssignment(id: string) {
  const rows = await db.attachment.findMany({ where: { revision: { assignmentId: id } }, select: { storageKey: true, thumbnailKey: true } });
  try { await db.assignment.delete({ where: { id } }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new HttpError(404, "Assignment not found.");
    throw error;
  }
  const keys = [...new Set(rows.flatMap((x) => [x.storageKey, x.thumbnailKey]).filter(Boolean) as string[])];
  for (const key of keys) if (await db.attachment.count({ where: { OR: [{ storageKey: key }, { thumbnailKey: key }] } }) === 0) await removeStored([key]);
}

export async function existingUpload(assignmentId: string, uploadId: string) {
  return db.attachment.findFirst({ where: { uploadId, revision: { assignmentId, draftFor: { isNot: null } } } });
}

export async function addAttachment(assignmentId: string, metadata: { storageKey: string; thumbnailKey: string | null; originalName: string; mimeType: string; sizeBytes: number; sha256: string; width: number | null; height: number | null; uploadId: string }) {
  try {
    return await db.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({ where: { id: assignmentId }, include: { draftRevision: { include: { _count: { select: { attachments: true } } } } } });
      if (!assignment?.draftRevision) throw new HttpError(404, "Assignment not found.");
      if (assignment.draftRevision._count.attachments >= config.maxFiles) throw new HttpError(400, `An assignment may contain at most ${config.maxFiles} attachments.`);
      const last = await tx.attachment.aggregate({ where: { revisionId: assignment.draftRevision.id }, _max: { position: true } });
      const attachment = await tx.attachment.create({ data: { ...metadata, revisionId: assignment.draftRevision.id, position: (last._max.position ?? -1) + 1 } });
      await tx.revision.update({ where: { id: assignment.draftRevision.id }, data: { updatedAt: new Date() } });
      await tx.assignment.update({ where: { id: assignmentId }, data: { updatedAt: new Date() } });
      return attachment;
    });
  } catch (error) { if (error instanceof HttpError) throw error; throw error; }
}

export async function reorderAttachments(assignmentId: string, ids: string[]) {
  const assignment = await managementAssignment(assignmentId);
  const draft = assignment.draftRevision!;
  const current = draft.attachments.map((x) => x.id);
  if (!validateOrder(current, ids)) throw new HttpError(400, "Attachment order must include every draft attachment exactly once.");
  await db.$transaction(async (tx) => {
    await Promise.all(ids.map((id, index) => tx.attachment.update({ where: { id }, data: { position: index + 10_000 } })));
    await Promise.all(ids.map((id, index) => tx.attachment.update({ where: { id }, data: { position: index } })));
    await tx.revision.update({ where: { id: draft.id }, data: { updatedAt: new Date() } });
    await tx.assignment.update({ where: { id: assignmentId }, data: { updatedAt: new Date() } });
  });
}

export async function removeDraftAttachment(assignmentId: string, attachmentId: string) {
  const assignment = await managementAssignment(assignmentId);
  const draft = assignment.draftRevision!;
  const attachment = draft.attachments.find((x) => x.id === attachmentId);
  if (!attachment) throw new HttpError(404, "Draft attachment not found.");
  await db.attachment.delete({ where: { id: attachmentId } });
  const stillUsed = await db.attachment.count({ where: { OR: [{ storageKey: attachment.storageKey }, ...(attachment.thumbnailKey ? [{ thumbnailKey: attachment.thumbnailKey }] : [])] } });
  if (!stillUsed) await removeStored([attachment.storageKey, attachment.thumbnailKey]);
  const remaining = await db.attachment.findMany({ where: { revisionId: draft.id }, orderBy: attachmentOrder });
  await db.$transaction(remaining.map((item, index) => db.attachment.update({ where: { id: item.id }, data: { position: index } })));
  await db.revision.update({ where: { id: draft.id }, data: { updatedAt: new Date() } });
  await db.assignment.update({ where: { id: assignmentId }, data: { updatedAt: new Date() } });
}

export async function listPublished() {
  return db.assignment.findMany({ where: { publishedRevisionId: { not: null } }, include: { publishedRevision: { include: { attachments: { orderBy: attachmentOrder } } } }, orderBy: { publishedRevision: { publishedAt: "desc" } } });
}
