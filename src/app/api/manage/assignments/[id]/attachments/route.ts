import { addAttachment, existingUpload } from "@/lib/assignments";
import { requireCsrf } from "@/lib/auth";
import { jsonError, privateJson, HttpError } from "@/lib/http";
import { persistUpload, removeStored } from "@/lib/storage";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let stored: Awaited<ReturnType<typeof persistUpload>> | null = null;
  try {
    await requireCsrf(request);
    const assignmentId = (await params).id;
    const uploadId = request.headers.get("x-upload-id") ?? "";
    if (!/^[a-zA-Z0-9_-]{20,100}$/.test(uploadId)) throw new HttpError(400, "A valid upload id is required.");
    const existing = await existingUpload(assignmentId, uploadId);
    if (existing) return privateJson({ ...existing, sizeBytes: Number(existing.sizeBytes), uploadedAt: existing.uploadedAt.toISOString(), duplicate: true });
    const rawName = request.headers.get("x-file-name");
    const originalName = rawName ? decodeURIComponent(rawName).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) : "attachment";
    if (!originalName) throw new HttpError(400, "A valid filename is required.");
    stored = await persistUpload(request.body);
    const attachment = await addAttachment(assignmentId, { ...stored, originalName, uploadId });
    return privateJson({ ...attachment, sizeBytes: Number(attachment.sizeBytes), uploadedAt: attachment.uploadedAt.toISOString() }, { status: 201 });
  } catch (error) { if (stored) await removeStored([stored.storageKey, stored.thumbnailKey]); return jsonError(error); }
}
