import { deleteAssignment, deleteTemporaryAssignment, managementAssignment, saveDraft } from "@/lib/assignments";
import { requireCsrf, requireSession } from "@/lib/auth";
import { jsonError, privateJson } from "@/lib/http";
import { serialiseRevision } from "@/lib/serialise";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireSession("MANAGEMENT"); const result = await managementAssignment((await params).id); return privateJson({ id: result.id, createdAt: result.createdAt.toISOString(), updatedAt: result.updatedAt.toISOString(), draft: serialiseRevision(result.draftRevision!), published: result.publishedRevision ? serialiseRevision(result.publishedRevision) : null }); } catch (e) { return jsonError(e); } }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireCsrf(request); return privateJson({ ok: true, ...await saveDraft((await params).id, await request.json()) }); } catch (e) { return jsonError(e); } }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireCsrf(request); const id = (await params).id; const temporaryOnly = new URL(request.url).searchParams.get("temporary") === "1"; const removed = temporaryOnly ? await deleteTemporaryAssignment(id) : (await deleteAssignment(id), true); return privateJson({ ok: true, removed }); } catch (e) { return jsonError(e); } }
