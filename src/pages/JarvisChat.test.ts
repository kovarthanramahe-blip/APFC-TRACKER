import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// JARVIS Phase 14 — CommandCentre.test.ts's own established convention: this repo has no
// @testing-library/react (confirmed by search, every earlier phase), so these pin the exact,
// source-verifiable structural claims the UI requirements depend on, rather than rendering.
const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, 'JarvisChat.tsx'), 'utf-8');
const appSource = readFileSync(join(root, '..', 'App.tsx'), 'utf-8');
const navSource = readFileSync(join(root, '..', 'components', 'layout', 'nav.ts'), 'utf-8');

describe('JarvisChat.tsx — reuses the EXISTING JARVIS architecture, never a parallel implementation', () => {
  it('drives requests through the EXISTING useJarvisConversation hook — only TYPES (never runJarvisRequest/streamJarvisRequest themselves) are imported from runtime.ts, and no Android/native module is imported at all', () => {
    // Only the import statements themselves — never prose/comments elsewhere in the file, which
    // may legitimately mention these function names for documentation purposes.
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    const importText = importLines.join('\n');

    expect(importText).toMatch(/from '..\/lib\/jarvisChat\/useJarvisConversation'/);
    expect(importText).not.toMatch(/\brunJarvisRequest\b/);
    expect(importText).not.toMatch(/\bstreamJarvisRequest\b/);
    expect(importText).not.toMatch(/from ['"].*\/jarvis\/ai\/android/);
  });

  it('reads runtime status through the EXISTING useJarvisRuntimeStatus hook — no native/llama.cpp call appears in this component file', () => {
    expect(source).toMatch(/from '..\/lib\/jarvisChat\/useJarvisRuntimeStatus'/);
    expect(source).not.toMatch(/llama_cpp|LlamaCppBackend|LocalLlamaRuntime\b/);
  });

  it('grounds requests via the EXISTING buildJarvisChatRequestContext — never invents its own toolInputs shape', () => {
    expect(source).toMatch(/buildJarvisChatRequestContext/);
  });
});

describe('JarvisChat.tsx — chat experience requirements', () => {
  it('renders an empty state when there are no messages yet', () => {
    expect(source).toMatch(/messages\.length === 0/);
    expect(source).toMatch(/function EmptyState/);
  });

  it('renders both user and jarvis roles distinctly', () => {
    expect(source).toMatch(/message\.role === 'user'/);
  });

  it('renders a streaming cursor only while a message is actively streaming', () => {
    expect(source).toMatch(/function StreamingCursor/);
    expect(source).toMatch(/message\.status === 'streaming'/);
  });

  it('supports cancellation while loading (Stop button wired to cancel())', () => {
    expect(source).toMatch(/isLoading \? \(/);
    expect(source).toMatch(/onClick=\{cancel\}/);
  });

  it('renders an error state with a retry action, never silently dropping a failure', () => {
    expect(source).toMatch(/message\.status === 'error'/);
    expect(source).toMatch(/onClick=\{\(\) => onRetry\(message\.id\)\}/);
  });

  it('renders a distinct cancelled state (never indistinguishable from a normal empty response)', () => {
    expect(source).toMatch(/message\.status === 'cancelled'/);
  });
});

describe('JarvisChat.tsx — runtime status display (Part 4 of this phase\'s own brief)', () => {
  it('uses the EXISTING JARVIS_UI_RUNTIME_STATUS_LABEL contract — never a hardcoded duplicate of the four labels', () => {
    expect(source).toMatch(/JARVIS_UI_RUNTIME_STATUS_LABEL/);
    expect(source).not.toMatch(/'Local AI Ready'/);
    expect(source).not.toMatch(/'Loading Model'/);
  });

  it('only shows the Qwen3/On-device/Private chips when status is genuinely model_ready', () => {
    const chipBlockStart = source.indexOf("status === 'model_ready' && (");
    expect(chipBlockStart).toBeGreaterThan(-1);
    const chipBlock = source.slice(chipBlockStart, source.indexOf('</div>', chipBlockStart));
    expect(chipBlock).toMatch(/On-device/);
    expect(chipBlock).toMatch(/Private/);
  });

  it('never hardcodes "model_ready" or fabricates availability — status comes entirely from the hook', () => {
    expect(source).not.toMatch(/const status = 'model_ready'/);
    expect(source).toMatch(/useJarvisRuntimeStatus\(\)/);
  });
});

describe('JarvisChat.tsx — grounding/no-fabrication (Part 5)', () => {
  it('the empty-state copy states the "never invents" guarantee explicitly to the user', () => {
    expect(source).toMatch(/never invent/i);
  });

  it('provenance is shown per-message using the EXISTING JarvisRuntimeProvenanceSource contract, never a new one', () => {
    expect(source).toMatch(/from '..\/lib\/jarvis\/runtime'/);
    expect(source).toMatch(/JarvisRuntimeProvenanceSource/);
  });
});

describe('JarvisChat.tsx — accessibility (Part 8)', () => {
  it('Enter submits, Shift+Enter inserts a newline (never submits on Shift+Enter)', () => {
    expect(source).toMatch(/event\.key === 'Enter' && !event\.shiftKey/);
  });

  it('the composer textarea and send/stop buttons carry accessible labels', () => {
    expect(source).toMatch(/aria-label="Message JARVIS"/);
    expect(source).toMatch(/aria-label="Send message"/);
    expect(source).toMatch(/aria-label="Stop generating"/);
  });

  it('the conversation region is announced to assistive tech as it updates', () => {
    expect(source).toMatch(/role="log"/);
    expect(source).toMatch(/aria-live="polite"/);
  });
});

describe('JarvisChat.tsx — architecture boundary (Part 10): no native/provider logic inside this component', () => {
  it('never imports @capacitor/core or any Kotlin/C++ concept directly', () => {
    expect(source).not.toMatch(/@capacitor\/core/);
    expect(source).not.toMatch(/\.kt['"]|\.cpp['"]/);
  });
});

describe('Routing/navigation integration (Part 1 + Part 7 responsive navigation)', () => {
  it('App.tsx registers a lazy /jarvis route', () => {
    expect(appSource).toMatch(/const JarvisChat = lazy\(\(\) => import\('\.\/pages\/JarvisChat'\)\)/);
    expect(appSource).toMatch(/<Route path="\/jarvis" element=\{<JarvisChat \/>\}\s*\/>/);
  });

  it('nav.ts exposes JARVIS from every workspace\'s own navigation (see nav.test.ts for the full assertions)', () => {
    expect(navSource).toMatch(/JARVIS_ITEM/);
  });
});
