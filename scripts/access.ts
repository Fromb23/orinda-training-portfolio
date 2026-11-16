import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { AccessRole } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";

const [command, roleName] = process.argv.slice(2);
const role = roleName === "management" ? AccessRole.MANAGEMENT : roleName === "supervisor" ? AccessRole.SUPERVISOR : null;
const key = process.env.TOKEN_HASH_KEY;
if (!role || !["provision", "rotate"].includes(command ?? "")) throw new Error("Usage: npm run access -- <provision|rotate> <management|supervisor>");
if (!key || key.length < 32) throw new Error("TOKEN_HASH_KEY must contain at least 32 characters.");
const token = randomBytes(32).toString("base64url");
const tokenHash = createHmac("sha256", key).update(token).digest("hex");
const existing = await db.credential.findUnique({ where: { role } });
if (command === "provision" && existing) throw new Error(`${roleName} access is already provisioned. Use rotate instead.`);
if (command === "rotate" && !existing) throw new Error(`${roleName} access is not provisioned. Use provision first.`);
await db.$transaction(async (tx) => {
  if (existing) {
    await tx.credential.update({ where: { role }, data: { tokenHash, version: { increment: 1 }, rotatedAt: new Date() } });
    await tx.session.deleteMany({ where: { credentialId: existing.id } });
  } else await tx.credential.create({ data: { role, tokenHash } });
});
const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const path = role === AccessRole.MANAGEMENT ? "management" : "supervisor";
process.stdout.write(`\n${command === "rotate" ? "Rotated" : "Provisioned"} ${roleName} access. Copy this link now; it cannot be recovered from the database:\n${base}/access/${path}?token=${token}\n\n`);
await db.$disconnect();
