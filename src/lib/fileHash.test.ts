import { describe, it, expect } from 'vitest';
import { sha256Hex } from './fileHash';

// Known SHA-256 test vector (NIST/common reference: the digest of the empty string).
const EMPTY_STRING_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('sha256Hex', () => {
  it('produces a deterministic 64-character lowercase hex digest for a known vector', async () => {
    // "abc" -> a well-known published SHA-256 test vector.
    const hash = await sha256Hex(new TextEncoder().encode('abc'));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes identical content to identical hashes, regardless of source shape', async () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const bytes = new TextEncoder().encode(text);

    const fromFile = await sha256Hex(new File([bytes], 'a.txt'));
    const fromArrayBuffer = await sha256Hex(bytes.buffer.slice(0) as ArrayBuffer);
    const fromUint8Array = await sha256Hex(bytes);

    expect(fromFile).toBe(fromArrayBuffer);
    expect(fromArrayBuffer).toBe(fromUint8Array);
    expect(fromFile).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes different content to different hashes', async () => {
    const hashA = await sha256Hex(new File(['Version one of the document.'], 'doc.txt'));
    const hashB = await sha256Hex(new File(['Version two of the document.'], 'doc.txt'));
    expect(hashA).not.toBe(hashB);
  });

  it('ignores filename entirely — same filename, different bytes, different hash', async () => {
    const hashA = await sha256Hex(new File(['Content A'], 'notes.md'));
    const hashB = await sha256Hex(new File(['Content B'], 'notes.md'));
    expect(hashA).not.toBe(hashB);
  });

  it('ignores filename entirely — different filename, identical bytes, identical hash', async () => {
    const hashA = await sha256Hex(new File(['Same bytes'], 'first-name.txt'));
    const hashB = await sha256Hex(new File(['Same bytes'], 'totally-different-name.md'));
    expect(hashA).toBe(hashB);
  });

  it('produces the well-known digest of the empty input', async () => {
    const hash = await sha256Hex(new File([], 'empty.txt'));
    expect(hash).toBe(EMPTY_STRING_SHA256);
  });

  it('hashes only a Uint8Array view\'s own bytes, not the whole underlying buffer', async () => {
    const full = new Uint8Array([0xaa, 0xaa, 1, 2, 3, 4, 0xbb, 0xbb]);
    const view = new Uint8Array(full.buffer, 2, 4); // just [1, 2, 3, 4]
    const direct = new Uint8Array([1, 2, 3, 4]);

    const fromView = await sha256Hex(view);
    const fromDirect = await sha256Hex(direct);
    expect(fromView).toBe(fromDirect);
  });

  it('is deterministic across repeated calls on the same input', async () => {
    const file = new File(['Repeat me'], 'repeat.txt');
    const first = await sha256Hex(file);
    const second = await sha256Hex(new File(['Repeat me'], 'repeat.txt'));
    expect(first).toBe(second);
  });
});
