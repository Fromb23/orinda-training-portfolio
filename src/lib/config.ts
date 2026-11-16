import path from "node:path";

function positiveInt(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  uploadDir: path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads")),
  maxFileBytes: positiveInt("MAX_FILE_BYTES", 15 * 1024 * 1024),
  maxFiles: positiveInt("MAX_FILES_PER_ASSIGNMENT", 30),
  maxRequestBytes: positiveInt("MAX_UPLOAD_REQUEST_BYTES", 15 * 1024 * 1024),
  sessionHours: positiveInt("SESSION_TTL_HOURS", 168),
};

export const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/pdf", ".pdf"],
]);
