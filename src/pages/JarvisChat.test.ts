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

describe('JarvisChat.tsx — "Ask about your notes" (deterministic, provider-free source retrieval)', () => {
  it('obtains notes/importedContent/activeWorkspaceId from the EXISTING store, never mock data', () => {
    const componentStart = source.indexOf('function WorkspaceEvidenceSearch()');
    expect(componentStart).toBeGreaterThan(-1);
    const componentBody = source.slice(componentStart, source.indexOf('\nfunction EmptyState()'));
    expect(componentBody).toMatch(/useAppStore\(\(s\) => s\.notes\)/);
    expect(componentBody).toMatch(/useAppStore\(\(s\) => s\.importedContent\)/);
    expect(componentBody).toMatch(/useAppStore\(\(s\) => s\.activeWorkspaceId\)/);
  });

  it('retrieves evidence through the EXISTING workspaceContentBridge functions only — no new retrieval/ranking logic in this file', () => {
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    const importText = importLines.join('\n');
    expect(importText).toMatch(/from '..\/lib\/jarvis\/workspaceContentBridge'/);
    expect(source).toMatch(/retrieveWorkspaceEvidence\(notes, importedContent, activeWorkspaceId/);
    expect(source).toMatch(/resolveWorkspaceDocumentTitle\(item\.citation\.documentId, notes, importedContent, activeWorkspaceId\)/);
  });

  it('never routes this feature through useJarvisConversation/runtime.ts — a direct text match can never be mistaken for an AI-generated chat message', () => {
    const componentStart = source.indexOf('function WorkspaceEvidenceSearch()');
    const componentBody = source.slice(componentStart, source.indexOf('\nfunction EmptyState()'));
    expect(componentBody).not.toMatch(/\bsend\(|\buseJarvisConversation\b/);
  });

  it('always shows a "not AI-generated" label, never only conditionally', () => {
    expect(source).toMatch(/Direct match, not AI-generated/);
  });

  it('handles an empty query distinctly from a real no-match result', () => {
    expect(source).toMatch(/trimmedQuery === '' \?/);
    expect(source).toMatch(/Type a question above to search/);
  });

  it('handles a workspace with no notes or documents distinctly from "no matches for this query"', () => {
    expect(source).toMatch(/workspaceIsEmpty \?/);
    expect(source).toMatch(/You don't have any notes or documents yet in this workspace\./);
  });

  it('handles a real query with zero matching evidence, never fabricating a result', () => {
    expect(source).toMatch(/evidence\.length === 0 \?/);
    expect(source).toMatch(/No matching passages found in your notes or documents\./);
  });

  it('falls back to an honest "Untitled source" label rather than fabricating a title when resolution fails or the real title is blank', () => {
    // `||`, not `??` — resolveWorkspaceDocumentTitle can return a real item whose title is an
    // empty string (an untitled note), which `??` would render as a blank, unlabelled citation.
    expect(source).toMatch(/resolved\?\.title \|\| 'Untitled source'/);
  });

  it('links a resolved citation to its real source via the EXISTING repositoryDetailPathFor — never a fabricated or guessed URL', () => {
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    const importText = importLines.join('\n');
    expect(importText).toMatch(/from '..\/lib\/repositoryNavigation'/);
    expect(source).toMatch(/repositoryDetailPathFor\(resolved\.itemType, resolved\.itemId\)/);
  });

  it('only renders a citation as a Link when resolveWorkspaceDocumentTitle actually found the item — a real item with a blank title still links (labelled "Untitled source" but real and navigable); only a documentId that fails to resolve at all (stale, deleted, or cross-workspace) falls back to plain, unlinked text', () => {
    expect(source).toMatch(/resolved \? \(\s*<Link/);
    expect(source).toMatch(/\) : \(\s*<span className="truncate">\{title\}<\/span>/);
  });

  it('renders each result\'s own citation quote (falling back to the raw chunk text), never a paraphrase', () => {
    expect(source).toMatch(/item\.citation\.quote \?\? item\.chunk\.text/);
  });

  it('the search input and results region carry accessible labels', () => {
    expect(source).toMatch(/aria-label="Search your notes and documents"/);
    expect(source).toMatch(/aria-label="Note and document search results"/);
  });

  it('never bypasses the bridge\'s own workspace scoping by reading notes/importedContent directly for display — every render path resolves through resolveWorkspaceDocumentTitle/retrieveWorkspaceEvidence', () => {
    const componentStart = source.indexOf('function WorkspaceEvidenceSearch()');
    const componentBody = source.slice(componentStart, source.indexOf('\nfunction EmptyState()'));
    // The only direct reads of notes/importedContent are: the store selectors themselves, the
    // workspaceIsEmpty length check, and passing them straight through to the bridge functions —
    // never a second, independent filter/search implementation inside this component.
    expect(componentBody).not.toMatch(/notes\.filter\(|notes\.find\(|importedContent\.filter\(|importedContent\.find\(/);
  });

  it('is actually rendered on the page, directly below the runtime status bar', () => {
    expect(source).toMatch(/<RuntimeStatusBar \/>\s*\n\s*<WorkspaceEvidenceSearch \/>/);
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
