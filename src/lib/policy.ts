import type { AccessRole } from "@/generated/prisma/client";

export function canMutate(role: AccessRole | null) { return role === "MANAGEMENT"; }
export function canReadRevision(role: AccessRole | null, isPublishedRevision: boolean) {
  return role === "MANAGEMENT" || (role === "SUPERVISOR" && isPublishedRevision);
}
export function assertPublishable(title: string, attachmentCount: number) {
  if (!title.trim()) throw new Error("A title is required before publishing.");
  if (attachmentCount < 1) throw new Error("At least one successfully uploaded attachment is required before publishing.");
}
