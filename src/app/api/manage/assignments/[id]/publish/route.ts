import { publishAssignment } from "@/lib/assignments"; import { requireCsrf } from "@/lib/auth"; import { jsonError, privateJson } from "@/lib/http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { await requireCsrf(request); return privateJson(await publishAssignment((await params).id)); } catch (e) { return jsonError(e); } }
