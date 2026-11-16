import { Readable } from "node:stream";
import { db } from "@/lib/db"; import { getSession } from "@/lib/auth"; import { canReadRevision } from "@/lib/policy"; import { jsonError, HttpError } from "@/lib/http"; import { openStored } from "@/lib/storage";

export const dynamic = "force-dynamic"; export const runtime = "nodejs";
function disposition(name: string, download: boolean) { const fallback = name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) || "attachment"; return `${download ? "attachment" : "inline"}; filename="${fallback.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`; }
export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const session = await getSession(); if (!session) throw new HttpError(401, "Authorisation required.");
    const attachment = await db.attachment.findUnique({ where: { id: (await params).attachmentId }, include: { revision: { include: { publishedFor: true } } } });
    if (!attachment || !canReadRevision(session.role, Boolean(attachment.revision.publishedFor))) throw new HttpError(404, "Attachment not found.");
    const url = new URL(request.url); const thumb = url.searchParams.get("variant") === "thumbnail";
    if (thumb && (!attachment.thumbnailKey || !attachment.mimeType.startsWith("image/"))) throw new HttpError(404, "Thumbnail not found.");
    const file = await openStored(thumb ? attachment.thumbnailKey! : attachment.storageKey);
    return new Response(Readable.toWeb(file.stream) as ReadableStream, { headers: { "Content-Type": thumb ? "image/webp" : attachment.mimeType, "Content-Length": String(file.size), "Content-Disposition": disposition(attachment.originalName, url.searchParams.get("download") === "1"), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return jsonError(e); }
}
