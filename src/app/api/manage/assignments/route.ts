import { requireCsrf, requireSession } from "@/lib/auth";
import { createAssignment } from "@/lib/assignments";
import { db } from "@/lib/db";
import { jsonError, privateJson } from "@/lib/http";
import { serialiseRevision } from "@/lib/serialise";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireSession("MANAGEMENT");
    const items = await db.assignment.findMany({ where: { isTemporary: false }, include: { draftRevision: { include: { attachments: { orderBy: { position: "asc" } } } }, publishedRevision: true }, orderBy: { updatedAt: "desc" } });
    return privateJson(items.map((x) => ({ id: x.id, createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString(), draft: x.draftRevision && serialiseRevision(x.draftRevision), publishedAt: x.publishedRevision?.publishedAt?.toISOString() ?? null })));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try { await requireCsrf(request); const body = await request.json(); const result = await createAssignment(body.title ?? "", body.description, body.temporary === true); return privateJson({ id: result.id }, { status: 201 }); }
  catch (error) { return jsonError(error); }
}
