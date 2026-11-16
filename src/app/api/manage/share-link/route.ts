import { requireSession, safeHashEqual, secretHash } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError, jsonError, privateJson } from "@/lib/http";
import { canonicalSiteOrigin } from "@/lib/site-url";

export async function GET() {
  try {
    await requireSession("MANAGEMENT");
    const link = process.env.SUPERVISOR_SHARE_URL;
    if (!link) return privateJson({ link: null, configured: false });
    let url: URL;
    try { url = new URL(link); }
    catch { throw new HttpError(500, "The configured supervisor share link is not a valid URL."); }
    const token = url.searchParams.get("token") ?? "";
    const validShape = url.origin === canonicalSiteOrigin()
      && url.pathname === "/access/supervisor"
      && token.length >= 40
      && [...url.searchParams.keys()].every((key) => key === "token")
      && !url.hash;
    const credential = validShape ? await db.credential.findUnique({ where: { role: "SUPERVISOR" } }) : null;
    if (!validShape || !credential || !safeHashEqual(credential.tokenHash, secretHash(token))) {
      throw new HttpError(500, "The configured supervisor share link is incomplete, outdated, or does not use the canonical supervisor access URL.");
    }
    return privateJson({ link: url.toString(), configured: true });
  } catch (error) { return jsonError(error); }
}
