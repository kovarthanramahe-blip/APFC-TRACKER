// Premium Knowledge Workspace — Phase 1: deterministic file hashing for exact-duplicate import
// detection (see lib/importDuplicates.ts). Uses the browser's built-in Web Crypto API
// (`crypto.subtle`) exclusively — no external crypto dependency, no Node-only API. Web Crypto is
// available identically in every target this app runs in (desktop/mobile browsers via Vite, the
// Capacitor Android WebView, and this repo's own Vitest/Node test runner — Node has shipped a
// spec-compliant `globalThis.crypto.subtle` since Node 19), so this one implementation serves
// both the real app and its tests with no environment-specific branching.
//
// Hashes RAW FILE BYTES only, never extracted/derived text — lib/contentImport.ts's own
// extraction (pdfjs/mammoth/turndown) can legitimately change over time, and two different source
// files can coincidentally extract to identical Markdown; neither should ever be mistaken for "the
// same file". A hash is only ever computed from bytes a caller actually has (a real File/
// ArrayBuffer/Uint8Array) — this module never fabricates one for content with no underlying file
// (a manually typed bibliography record, a legacy/programmatic import), which is exactly why
// lib/importDuplicates.ts treats a missing hash as "nothing to compare", not as a mismatch.

/** Accepts a real File, an ArrayBuffer, or a Uint8Array — the three shapes a caller is realistically
 * holding the original bytes in (a picked file, an already-read buffer, or a typed-array view). */
export type HashableData = File | ArrayBuffer | Uint8Array;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // A Uint8Array may be a VIEW into a larger buffer (e.g. `new Uint8Array(bigBuffer, 10, 20)`) —
  // slicing to its own byteOffset/byteLength ensures only ITS bytes are hashed, never the whole
  // underlying buffer.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes a deterministic SHA-256 hex digest of `data`'s raw bytes. The same bytes always produce
 * the same 64-character lowercase hex string, run to run, environment to environment — this is
 * the one property lib/importDuplicates.ts's exact-duplicate check depends on. Never throws for a
 * well-formed input; a File that fails to read (a rare I/O error) rejects the returned promise,
 * which callers already handle the same way they handle any other extraction failure (see
 * lib/contentImport.ts's own extractContentFromFile try/catch discipline).
 */
export async function sha256Hex(data: HashableData): Promise<string> {
  const buffer = data instanceof File ? await data.arrayBuffer() : data instanceof Uint8Array ? toArrayBuffer(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(digest);
}
