import { requireSession } from "@/lib/auth"; import { jsonError, privateJson } from "@/lib/http";
export async function GET() { try { await requireSession("MANAGEMENT"); const link = process.env.SUPERVISOR_SHARE_URL; return privateJson({ link: link || null, configured: Boolean(link) }); } catch (e) { return jsonError(e); } }
