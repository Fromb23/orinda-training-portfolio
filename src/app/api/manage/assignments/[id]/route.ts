import { deleteAssignment, managementAssignment, reorderAttachments, updateDraft } from "@/lib/assignments";
import { requireCsrf, requireSession } from "@/lib/auth";
import { jsonError, privateJson } from "@/lib/http";
import { serialiseRevision } from "@/lib/serialise";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireSession("MANAGEMENT"); const result = await managementAssignment((await params).id); return privateJson({ id: result.id, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString(), draft: serialiseRevision(result.draftRevision!), published: result.publishedRevision ? serialiseRevision(result.publishedRevision) : null }); } catch (e) { return jsonError(e); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireCsrf(request); const body = await request.json(); const id = (await params).id; if (body.attachmentOrder) await reorderAttachments(id, body.attachmentOrder); if (body.title !== undefined || body.description !== undefined) await updateDraft(id, body); return privateJson({ ok: true }); } catch (e) { return jsonError(e); } }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireCsrf(request); await deleteAssignment((await params).id); return privateJson({ ok: true }); } catch (e) { return jsonError(e); } }
