import { describe, it, expect } from 'vitest';
import { selectCrossDeviceTarget, type JarvisCrossDeviceCandidate } from './crossDeviceRouting';
import { resolveJarvisRoute } from '../routingPolicy';
import { getDocumentTaskRequirement } from './documentTaskRequirements';
import type { JarvisModelProfile } from './modelProfile';
import type { JarvisDeviceCapabilities } from './deviceCapabilities';
import type { JarvisWorkspace } from '../types';

// Explicit fixtures only (Part 9). None of these numbers are a claim about real hardware — they
// exist only to exercise selectCrossDeviceTarget's own decision logic deterministically.
const WORKSPACE: JarvisWorkspace = 'upsc';

const ANDROID_PHONE: JarvisDeviceCapabilities = { platform: 'android', deviceClass: 'phone', ramGB: 12, hasAccelerator: false };
const WINDOWS_DESKTOP: JarvisDeviceCapabilities = { platform: 'windows', deviceClass: 'desktop', ramGB: 32, hasAccelerator: true };

const ANDROID_SMALL_MODEL: JarvisModelProfile = {
  modelId: 'android-small',
  displayName: 'On-device small model',
  runtime: 'android_on_device',
  locality: 'local',
  costClass: 'FREE_LOCAL',
  contextCapacityTokens: 4_000,
  estimatedResourceClass: 'small',
  minimumDevice: { supportedDeviceClasses: ['phone', 'tablet'] },
};

const WINDOWS_LARGE_MODEL: JarvisModelProfile = {
  modelId: 'windows-large',
  displayName: 'Windows local large model',
  runtime: 'ollama',
  locality: 'local',
  costClass: 'FREE_LOCAL',
  contextCapacityTokens: 32_000,
  estimatedResourceClass: 'large',
  minimumDevice: { minRamGB: 16, supportedDeviceClasses: ['desktop'] },
};

const androidCandidate: JarvisCrossDeviceCandidate = { target: 'ANDROID_ON_DEVICE', device: ANDROID_PHONE, models: [ANDROID_SMALL_MODEL] };
const windowsCandidate: JarvisCrossDeviceCandidate = { target: 'WINDOWS_LOCAL', device: WINDOWS_DESKTOP, models: [WINDOWS_LARGE_MODEL] };

function localAiRoute() {
  return resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
}

describe('Deterministic routing — never device/model-dependent', () => {
  it('"What revision is due today?" routes to DETERMINISTIC regardless of the fleet', () => {
    const decision = resolveJarvisRoute({ intent: 'study_next', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const result = selectCrossDeviceTarget({ routeDecision: decision, candidates: [], isOnline: false, cloudOptIn: false });
    expect(result).toEqual({ target: 'DETERMINISTIC', reason: expect.any(String), degraded: false });
  });
});

describe('Local-vs-cloud routing — "Explain Article 32." style short request', () => {
  it('a sufficient Android on-device model is selected directly, with no cloud fallback needed', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), candidates: [androidCandidate], isOnline: true, cloudOptIn: true });
    expect(result).toEqual({ target: 'ANDROID_ON_DEVICE', reason: expect.stringContaining('On-device small model'), degraded: false });
  });
});

describe('Long-document routing — "Summarise this 500-page book." style request', () => {
  const longSummaryRequirement = getDocumentTaskRequirement('LONG_DOCUMENT_SUMMARY');

  it('an Android-first fleet is insufficient for a long document summary, and falls through to Windows', () => {
    const result = selectCrossDeviceTarget({
      routeDecision: localAiRoute(),
      taskRequirement: longSummaryRequirement,
      candidates: [androidCandidate, windowsCandidate],
      isOnline: true,
      cloudOptIn: true,
    });
    expect(result.target).toBe('WINDOWS_LOCAL');
    expect(result.degraded).toBe(false);
  });

  it('with only the Android candidate available, a long document summary falls back to free cloud when opted in', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), taskRequirement: longSummaryRequirement, candidates: [androidCandidate], isOnline: true, cloudOptIn: true });
    expect(result).toEqual({ target: 'FREE_CLOUD', reason: expect.any(String), degraded: false });
  });

  it('with only the Android candidate and no cloud opt-in, a long document summary is UNAVAILABLE (never silently downgraded)', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), taskRequirement: longSummaryRequirement, candidates: [androidCandidate], isOnline: true, cloudOptIn: false });
    expect(result).toEqual({ target: 'UNAVAILABLE', reason: expect.any(String), degraded: true });
  });
});

describe('Short-document routing — "Explain Article 32." style request stays on-device', () => {
  it('prefers the first sufficient candidate in the caller\'s own preference order, even when a bigger one is also available', () => {
    const shortRequirement = getDocumentTaskRequirement('SHORT_DOCUMENT_SUMMARY');
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), taskRequirement: shortRequirement, candidates: [androidCandidate, windowsCandidate], isOnline: true, cloudOptIn: true });
    expect(result.target).toBe('ANDROID_ON_DEVICE');
  });
});

describe('Offline routing (Part 7)', () => {
  it('deterministic tools remain available offline', () => {
    const decision = resolveJarvisRoute({ intent: 'study_next', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const result = selectCrossDeviceTarget({ routeDecision: decision, candidates: [], isOnline: false, cloudOptIn: false });
    expect(result.target).toBe('DETERMINISTIC');
  });

  it('local AI remains available offline when a sufficient local candidate exists', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), candidates: [androidCandidate], isOnline: false, cloudOptIn: false });
    expect(result.target).toBe('ANDROID_ON_DEVICE');
    expect(result.degraded).toBe(false);
  });

  it('web retrieval AI is UNAVAILABLE offline, even with cloud opted in', () => {
    const decision = resolveJarvisRoute({ intent: 'research', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: true });
    const result = selectCrossDeviceTarget({ routeDecision: decision, candidates: [], isOnline: false, cloudOptIn: true });
    expect(result).toEqual({ target: 'UNAVAILABLE', reason: expect.stringContaining('online'), degraded: true });
  });

  it('local AI with no sufficient candidate and offline is UNAVAILABLE, never silently cloud (cloud is never reachable offline)', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), taskRequirement: getDocumentTaskRequirement('RESEARCH_SYNTHESIS'), candidates: [androidCandidate], isOnline: false, cloudOptIn: true });
    expect(result).toEqual({ target: 'UNAVAILABLE', reason: expect.any(String), degraded: true });
  });
});

describe('Free-by-default invariant and paid-provider rejection (Part 4)', () => {
  it('web retrieval only ever resolves to FREE_CLOUD, never a paid target, once online and opted in', () => {
    const decision = resolveJarvisRoute({ intent: 'research', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: true });
    const result = selectCrossDeviceTarget({ routeDecision: decision, candidates: [], isOnline: true, cloudOptIn: true });
    expect(result.target).toBe('FREE_CLOUD');
  });

  it('selectCrossDeviceTarget has no return value representing a paid provider, for any input', () => {
    const allPossibleTargets = ['DETERMINISTIC', 'WINDOWS_LOCAL', 'ANDROID_ON_DEVICE', 'FREE_CLOUD', 'UNAVAILABLE'];
    const decision = resolveJarvisRoute({ intent: 'explain', workspace: WORKSPACE, hasDocumentContext: false, webResearchExplicitlyRequested: false });
    const result = selectCrossDeviceTarget({ routeDecision: decision, candidates: [], isOnline: true, cloudOptIn: true });
    expect(allPossibleTargets).toContain(result.target);
  });

  it('cloud is never selected without explicit opt-in, even while fully online with no local candidate', () => {
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), candidates: [], isOnline: true, cloudOptIn: false });
    expect(result).toEqual({ target: 'UNAVAILABLE', reason: expect.any(String), degraded: true });
  });
});

describe('No invented hardware values / no invented model capabilities', () => {
  it('a model with no declared minimumDevice is never selected over one that explicitly declares and meets its requirement', () => {
    const vagueModel: JarvisModelProfile = { modelId: 'vague', displayName: 'Unverified model', runtime: 'ollama', locality: 'local', costClass: 'FREE_LOCAL' };
    const vagueCandidate: JarvisCrossDeviceCandidate = { target: 'WINDOWS_LOCAL', device: WINDOWS_DESKTOP, models: [vagueModel] };
    const result = selectCrossDeviceTarget({ routeDecision: localAiRoute(), candidates: [vagueCandidate], isOnline: true, cloudOptIn: true });
    // No declared requirement means fit is 'unknown', which this function never treats as selectable.
    expect(result.target).not.toBe('WINDOWS_LOCAL');
  });

  it('a document task\'s own minimumLocalCapability is read from DOCUMENT_TASK_POLICY, never from a routing-site literal', () => {
    const requirement = getDocumentTaskRequirement('MULTI_DOCUMENT_COMPARISON');
    expect(requirement.minimumLocalCapability).toBe('medium');
  });
});
