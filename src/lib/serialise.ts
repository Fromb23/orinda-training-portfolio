type AttachmentLike = { sizeBytes: bigint; uploadedAt: Date };
type RevisionLike = { createdAt: Date; updatedAt: Date; publishedAt: Date | null; attachments: AttachmentLike[] };
type SerialisedAttachment<T extends AttachmentLike> = Omit<T, "sizeBytes" | "uploadedAt"> & { sizeBytes: number; uploadedAt: string };
type SerialisedRevision<T extends RevisionLike> = Omit<T, "createdAt" | "updatedAt" | "publishedAt" | "attachments"> & {
  createdAt: string; updatedAt: string; publishedAt: string | null; attachments: SerialisedAttachment<T["attachments"][number]>[];
};

export function serialiseRevision<T extends RevisionLike>(revision: T): SerialisedRevision<T> {
  return { ...revision, createdAt: revision.createdAt.toISOString(), updatedAt: revision.updatedAt.toISOString(), publishedAt: revision.publishedAt?.toISOString() ?? null,
    attachments: revision.attachments.map((item) => ({ ...item, sizeBytes: Number(item.sizeBytes), uploadedAt: item.uploadedAt.toISOString() })) } as unknown as SerialisedRevision<T>;
}
