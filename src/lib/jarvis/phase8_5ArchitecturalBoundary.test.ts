import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isRouteTableFreeByDefault } from './routingPolicy';
import { selectCrossDeviceTarget } from './ai/crossDeviceRouting';
import { resolveJarvisRoute } from './routingPolicy';
import type { JarvisWorkspace } from './types';

// JARVIS Phase 8.5 — architectural boundary verification (Part 10).
const dir = dirname(fileURLToPath(import.meta.url));

const PHASE_8_5_SOURCE_FILES = ['ai/deviceCapabilities.ts', 'ai/modelProfile.ts', 'ai/documentTaskRequirements.ts', 'ai/crossDeviceRouting.ts'];

function readPhase8_5Source(relativePath: string): string {
  return readFileSync(join(dir, relativePath), 'utf-8');
}

describe('Phase 8.5 — no model download, no runtime installation', () => {
  for (const file of PHASE_8_5_SOURCE_FILES) {
    it(`${file} never shells out, installs, or downloads anything`, () => {
      const source = readPhase8_5Source(file);
      expect(source).not.toMatch(/child_process/);
      expect(source).not.toMatch(/\bexec(File)?\s*\(/);
      expect(source).not.toMatch(/\bfetch\s*\(/); // this layer is pure decision logic — it calls no network/runtime itself
      expect(source).not.toMatch(/\/api\/pull/);
      expect(source).not.toMatch(/ollama\s+(pull|run|serve)\b/i);
      expect(source).not.toMatch(/npm\s+install|pip\s+install|apt-get/);
    });
  }
});

describe('Phase 8.5 — no API key, no paid SDK', () => {
  for (const file of PHASE_8_5_SOURCE_FILES) {
    it(`${file} contains no provider secret or paid SDK import`, () => {
      const source = readPhase8_5Source(file);
      expect(source).not.toMatch(/from ['"].*(openai|anthropic|@google\/genai)/i);
      expect(source).not.toMatch(/require\(['"].*(openai|anthropic|@google\/genai)/i);
      expect(source).not.toMatch(/['"]sk-[a-zA-Z0-9]{10,}['"]/);
      expect(source).not.toMatch(/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    });
  }
});

describe('Phase 8.5 — no Native Ink / annotation import, no Android implementation yet', () => {
  const FORBIDDEN_PATTERNS = [
    /from ['"].*\/store['"]/,
    /from ['"].*\/components\/annotations/,
    /NativeInkOverlayView|NativeInkPlugin|AnnotationLayer|AnnotationToolbar|DocumentAnnotator/,
    /zustand/,
    // "android" as a real import path (a Capacitor/native module, a Kotlin/Java file reference)
    // is forbidden; the bare string literal 'android' as a JarvisDevicePlatform/target VALUE is
    // not, and is in fact required by this phase's own brief — so this checks import syntax only.
    /from ['"].*android.*['"]/i,
    /require\(['"].*android.*['"]\)/i,
  ];

  for (const file of PHASE_8_5_SOURCE_FILES) {
    it(`${file} never imports Android/annotation/Zustand-store code, and implements no Android runtime`, () => {
      const source = readPhase8_5Source(file);
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it('ANDROID_ON_DEVICE is represented only as a string literal target label in crossDeviceRouting.ts, never backed by a real adapter call', () => {
    const source = readPhase8_5Source('ai/crossDeviceRouting.ts');
    expect(source).toContain('ANDROID_ON_DEVICE');
    // No real inference call of any kind appears anywhere in this phase's routing-decision layer.
    expect(source).not.toMatch(/\.chat\(|\.complete\(|\.stream\(/);
  });
});

describe('Phase 8.5 — no hardcoded personal hardware assumptions in production code', () => {
  it('deviceCapabilities.ts never hardcodes a RAM/storage number anywhere in its own source', () => {
    const source = readPhase8_5Source('ai/deviceCapabilities.ts');
    // Only type/interface declarations and doc comments may exist — no numeric literal should be
    // assigned to a capability field (e.g. "ramGB: 12") anywhere in this contract-only file.
    expect(source).not.toMatch(/ramGB\s*:\s*\d/);
    expect(source).not.toMatch(/storageAvailableGB\s*:\s*\d/);
  });

  it('crossDeviceRouting.ts never special-cases a named real device/product (e.g. a specific phone model)', () => {
    const source = readPhase8_5Source('ai/crossDeviceRouting.ts');
    expect(source).not.toMatch(/Samsung|S24|Xiaomi|Pad 6/i);
  });
});

describe('Phase 8.5 — provider-specific logic never leaks into UI (no React/component import anywhere in this phase)', () => {
  for (const file of PHASE_8_5_SOURCE_FILES) {
    it(`${file} imports no React/component/page module`, () => {
      const source = readPhase8_5Source(file);
      expect(source).not.toMatch(/from ['"]react['"]/);
      expect(source).not.toMatch(/from ['"].*\/pages\//);
      expect(source).not.toMatch(/from ['"].*\/components\//);
    });
  }
});

describe('Phase 8.5 — routing remains deterministic and free-by-default', () => {
  const WORKSPACE: JarvisWorkspace = 'global';

  it('the same input to selectCrossDeviceTarget always produces the same decision', () => {
    const decision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const input = { routeDecision: decision, candidates: [], isOnline: true, cloudOptIn: false } as const;
    expect(selectCrossDeviceTarget(input)).toEqual(selectCrossDeviceTarget(input));
  });

  it('the underlying route table this phase builds on remains free-by-default', () => {
    expect(isRouteTableFreeByDefault()).toBe(true);
  });
});
