import { afterAll, describe, expect, it } from "vitest";
import { buildPublication } from "../src/lib/publication-core";
import { persistUpload, removeStored } from "../src/lib/storage";

describe("immutable publication snapshots and timestamps", () => {
  it("preserves attachment order/upload time while assigning an independent publication time", () => {
    const uploadedAt = new Date("2026-01-01T10:00:00Z"); const publishedAt = new Date("2026-01-02T11:00:00Z");
    const draft = { number: 4, title: "Ordered pages", description: "Draft", attachments: [
      { storageKey:"a.pdf",thumbnailKey:null,originalName:"page-2.pdf",mimeType:"application/pdf",sizeBytes:2n,sha256:"a".repeat(64),width:null,height:null,position:1,uploadedAt },
      { storageKey:"b.pdf",thumbnailKey:null,originalName:"page-1.pdf",mimeType:"application/pdf",sizeBytes:2n,sha256:"b".repeat(64),width:null,height:null,position:0,uploadedAt },
    ] };
    const snapshot = buildPublication(draft, publishedAt);
    expect(snapshot.publishedAt).toBe(publishedAt); expect(snapshot.attachments.map(x=>x.position)).toEqual([1,0]); expect(snapshot.attachments[0].uploadedAt).toBe(uploadedAt); expect(snapshot.nextNumber).toBe(5);
  });
  it("does not let later draft metadata changes alter the publication payload", () => {
    const draft = { number:1,title:"Published title",description:null,attachments:[{storageKey:"a.pdf",thumbnailKey:null,originalName:"original.pdf",mimeType:"application/pdf",sizeBytes:1n,sha256:"a".repeat(64),width:null,height:null,position:0,uploadedAt:new Date()}] };
    const snapshot=buildPublication(draft,new Date()); draft.title="Private edit"; draft.attachments[0].originalName="private-edit.pdf";
    expect(snapshot.title).toBe("Published title"); expect(snapshot.attachments[0].originalName).toBe("original.pdf");
  });
});

describe("streamed upload validation and failure cleanup", () => {
  const stored: string[]=[]; afterAll(async()=>removeStored(stored));
  it("rejects content that does not match the allowlist", async()=>{const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("<html>not an image</html>"));c.close()}});await expect(persistUpload(body)).rejects.toThrow(/JPEG, PNG, WebP, and PDF/)});
  it("accepts a PDF based on its bytes, independent of a client MIME value", async()=>{const bytes=new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");const body=new ReadableStream({start(c){c.enqueue(bytes);c.close()}});const result=await persistUpload(body);stored.push(result.storageKey);expect(result.mimeType).toBe("application/pdf");expect(result.sizeBytes).toBe(bytes.length)});
});
