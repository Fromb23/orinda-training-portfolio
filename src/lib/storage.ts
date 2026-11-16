import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";
import { ALLOWED_TYPES, config } from "./config";
import { HttpError } from "./http";

export function storagePath(key: string) {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/.test(key)) throw new HttpError(400, "Invalid storage key.");
  const result = path.resolve(config.uploadDir, key);
  if (path.dirname(result) !== config.uploadDir) throw new HttpError(400, "Invalid storage path.");
  return result;
}

export async function persistUpload(body: ReadableStream<Uint8Array> | null) {
  if (!body) throw new HttpError(400, "No file was supplied.");
  await mkdir(config.uploadDir, { recursive: true, mode: 0o750 });
  const tempKey = `${randomUUID()}.tmp`;
  const tempPath = path.join(config.uploadDir, tempKey);
  const completedKeys: string[] = [];
  let bytes = 0;
  const hash = createHash("sha256");
  const limiter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > Math.min(config.maxFileBytes, config.maxRequestBytes)) return callback(new HttpError(413, "File is larger than the configured limit."));
    hash.update(chunk); callback(null, chunk);
  }});
  try {
    await pipeline(Readable.fromWeb(body as never), limiter, createWriteStream(tempPath, { flags: "wx", mode: 0o640 }));
    if (!bytes) throw new HttpError(400, "The uploaded file is empty.");
    const detected = await fileTypeFromFile(tempPath);
    if (!detected || !ALLOWED_TYPES.has(detected.mime)) throw new HttpError(415, "Only JPEG, PNG, WebP, and PDF files are supported.");
    const key = `${randomUUID()}${ALLOWED_TYPES.get(detected.mime)}`;
    await rename(tempPath, storagePath(key));
    completedKeys.push(key);
    let thumbnailKey: string | null = null; let width: number | null = null; let height: number | null = null;
    if (detected.mime.startsWith("image/")) {
      const metadata = await sharp(storagePath(key), { failOn: "warning", limitInputPixels: 40_000_000 }).metadata();
      width = metadata.width ?? null; height = metadata.height ?? null;
      thumbnailKey = `${randomUUID()}.webp`;
      await sharp(storagePath(key), { failOn: "warning", limitInputPixels: 40_000_000 }).rotate().resize(720, 720, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(storagePath(thumbnailKey));
      await chmod(storagePath(thumbnailKey), 0o640);
      completedKeys.push(thumbnailKey);
    }
    return { storageKey: key, thumbnailKey, mimeType: detected.mime, sizeBytes: bytes, sha256: hash.digest("hex"), width, height };
  } catch (error) { await rm(tempPath, { force: true }).catch(() => undefined); await removeStored(completedKeys); throw error; }
}

export async function removeStored(keys: Array<string | null | undefined>) {
  await Promise.all(keys.filter(Boolean).map((key) => rm(storagePath(key!), { force: true }).catch(() => undefined)));
}

export async function openStored(key: string) {
  const filePath = storagePath(key); const info = await stat(filePath);
  return { stream: createReadStream(filePath), size: info.size };
}
