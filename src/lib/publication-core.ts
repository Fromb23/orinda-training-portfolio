type SnapshotAttachment = {
  storageKey: string; thumbnailKey: string | null; originalName: string; mimeType: string; sizeBytes: bigint;
  sha256: string; width: number | null; height: number | null; position: number; uploadedAt: Date;
};
type WorkingRevision = { number: number; title: string; description: string | null; attachments: SnapshotAttachment[] };

export function buildPublication(draft: WorkingRevision, publishedAt: Date) {
  return {
    publishedAt,
    nextNumber: draft.number + 1,
    title: draft.title,
    description: draft.description,
    attachments: draft.attachments.map((attachment) => ({ ...attachment })),
  };
}
