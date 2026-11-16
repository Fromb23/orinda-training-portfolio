import "dotenv/config";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

const directory = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
const attachments = await db.attachment.findMany({ select: { storageKey: true, thumbnailKey: true } });
const referenced = new Set(attachments.flatMap((x) => [x.storageKey, x.thumbnailKey]).filter(Boolean));
let removed = 0;
for (const name of await readdir(directory).catch(() => [] as string[])) {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(name)) continue;
  const fullPath = path.resolve(directory, name);
  if (path.dirname(fullPath) !== directory) continue;
  const info = await stat(fullPath);
  const staleTemp = name.endsWith(".tmp") && Date.now() - info.mtimeMs > 24 * 60 * 60 * 1000;
  if (staleTemp || (!name.endsWith(".tmp") && !referenced.has(name))) { await rm(fullPath); removed += 1; }
}
process.stdout.write(`Removed ${removed} unreferenced or stale temporary file(s).\n`);
await db.$disconnect();
