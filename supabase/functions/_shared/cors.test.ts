import { describe, it, expect } from 'vitest';
import { parseAllowedOrigins, resolveAllowedOrigin, buildCorsHeaders, CORS_ALLOWED_HEADERS, CORS_ALLOWED_METHODS } from './cors';

describe('parseAllowedOrigins', () => {
  it('returns [] for undefined/null/empty', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins(null)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('splits, trims, and drops empty entries', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com ,,')).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('resolveAllowedOrigin', () => {
  it('returns null when there is no request origin (same-origin/non-browser request)', () => {
    expect(resolveAllowedOrigin(null, ['https://a.com'])).toBeNull();
  });

  it('returns the origin when it is in the allowlist', () => {
    expect(resolveAllowedOrigin('https://a.com', ['https://a.com', 'https://b.com'])).toBe('https://a.com');
  });

  it('returns null when the origin is not in the allowlist', () => {
    expect(resolveAllowedOrigin('https://evil.example', ['https://a.com'])).toBeNull();
  });
});

describe('buildCorsHeaders', () => {
  it('never returns a wildcard origin', () => {
    const headers = buildCorsHeaders('https://a.com', ['https://a.com']);
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://a.com');
  });

  it('omits Access-Control-Allow-Origin entirely for a disallowed origin — fails closed, never open', () => {
    const headers = buildCorsHeaders('https://evil.example', []);
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('omits Access-Control-Allow-Origin when ALLOWED_ORIGINS is unconfigured (empty allowlist)', () => {
    const headers = buildCorsHeaders('https://anything.example', []);
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('always sets Vary: Origin and the bounded allowed headers/methods', () => {
    const headers = buildCorsHeaders(null, []);
    expect(headers.Vary).toBe('Origin');
    expect(headers['Access-Control-Allow-Headers']).toBe(CORS_ALLOWED_HEADERS);
    expect(headers['Access-Control-Allow-Methods']).toBe(CORS_ALLOWED_METHODS);
  });

  it('only allows the methods this gateway actually needs', () => {
    expect(CORS_ALLOWED_METHODS).toBe('POST, OPTIONS');
  });
});
