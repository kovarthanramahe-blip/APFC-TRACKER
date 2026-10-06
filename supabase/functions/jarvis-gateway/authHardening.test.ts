import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 5.1 — auth-hardening verification.
//
// index.ts now uses `npm:@supabase/server@^1`'s `withSupabase` — a Deno URL-style import that
// cannot be executed by this repo's Node-based Vitest suite (the same constraint Phase 5's own
// `Deno.serve` handler had). So "does an unauthenticated request actually get rejected" and
// "does an authenticated request actually reach the handler" are NOT something this suite can
// exercise end-to-end without the real Supabase Edge Runtime (Docker — unavailable in this
// sandbox, see this phase's own report). That behaviour is `withSupabase`'s own, already-tested,
// platform-level code, not logic this repository owns or should re-test.
//
// What THIS file verifies instead, statically, is the actual WIRING: that the auth hardening was
// really applied (the redundant manual auth.getUser()/createClient() path is GONE, not just
// described as gone in a comment), that the documented `auth: 'user'` mode is actually requested,
// and that Phase 5's own explicit-allowlist CORS logic is still the thing actually running (never
// silently swapped for a wildcard or for withSupabase's own un-auditable default).
const dir = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(dir, 'index.ts'), 'utf-8');

describe('jarvis-gateway auth hardening — withSupabase wiring', () => {
  it('imports withSupabase from the current @supabase/server package', () => {
    expect(indexSource).toMatch(/from ['"]npm:@supabase\/server@\^1['"]/);
  });

  it('requests user-JWT authentication mode', () => {
    expect(indexSource).toMatch(/auth:\s*['"]user['"]/);
  });

  it('removed the Phase 5 redundant manual auth check — no second getUser() call or createClient() import remains', () => {
    expect(indexSource).not.toMatch(/\.auth\.getUser\(/);
    expect(indexSource).not.toMatch(/from ['"]npm:@supabase\/supabase-js/);
  });

  it('never references the service-role client withSupabase would otherwise expose', () => {
    expect(indexSource).not.toMatch(/supabaseAdmin/);
  });

  it('never trusts a body-supplied field for identity (no userId/user_id read from the parsed request body)', () => {
    expect(indexSource).not.toMatch(/userId|user_id/);
  });
});

describe('jarvis-gateway auth hardening — CORS unchanged and still explicit-allowlist', () => {
  it('opts out of withSupabase\'s own CORS handling rather than trusting an unaudited default', () => {
    expect(indexSource).toMatch(/cors:\s*['"]disabled['"]/);
  });

  it('still wires up the Phase 5 explicit-allowlist CORS helpers, unchanged', () => {
    expect(indexSource).toMatch(/buildCorsHeaders/);
    expect(indexSource).toMatch(/parseAllowedOrigins/);
    expect(indexSource).toMatch(/from ['"]\.\.\/_shared\/cors\.ts['"]/);
  });

  it('never introduces a wildcard origin', () => {
    expect(indexSource).not.toMatch(/Access-Control-Allow-Origin.*\*/);
  });

  it('still explicitly handles the OPTIONS preflight method', () => {
    expect(indexSource).toMatch(/req\.method === 'OPTIONS'/);
  });
});

describe('jarvis-gateway auth hardening — still thin, still delegates validation', () => {
  it('still delegates request validation to validation.ts rather than inlining it', () => {
    expect(indexSource).toMatch(/from ['"]\.\/validation\.ts['"]/);
  });

  it('stays under the same thinness bound as Phase 5', () => {
    expect(indexSource.split('\n').length).toBeLessThan(120);
  });
});
