/**
 * Magic-byte sniffing for resume uploads — we validate the actual file
 * content, not the client-supplied filename extension or Content-Type
 * header (both are trivially spoofable).
 */

export const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type DetectedFileType = "pdf" | "docx" | "doc";

const SIGNATURES: Array<{ type: DetectedFileType; mimeType: string; bytes: number[] }> = [
  { type: "pdf", mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  {
    type: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x50, 0x4b, 0x03, 0x04], // ZIP local file header (OOXML container)
  },
  { type: "doc", mimeType: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // legacy OLE compound file
];

export function detectFileType(buffer: Buffer): { type: DetectedFileType; mimeType: string } | null {
  for (const sig of SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) {
      return { type: sig.type, mimeType: sig.mimeType };
    }
  }
  return null;
}

export function assertValidResumeFile(buffer: Buffer): { type: DetectedFileType; mimeType: string } {
  if (buffer.length === 0 || buffer.length > MAX_RESUME_SIZE_BYTES) {
    throw new Error(`Resume file must be between 1 byte and ${MAX_RESUME_SIZE_BYTES / (1024 * 1024)}MB`);
  }
  const detected = detectFileType(buffer);
  if (!detected) {
    throw new Error("Resume file must be a valid PDF, DOC, or DOCX (detected by content, not extension)");
  }
  return detected;
}
