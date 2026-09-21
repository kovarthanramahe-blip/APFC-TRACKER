import type { PYQ } from '../lib/types';

// Multi-Workspace OS, Stage 3B-2A — UPSC CSE PYQ pilot dataset.
//
// STATUS: EMPTY. Zero questions imported this stage — this is a deliberate STOP, not an
// oversight, per this stage's own explicit instruction: "If an authoritative source cannot be
// verified from the available repository/environment: STOP the import and report that limitation
// rather than fabricating questions."
//
// What was checked before deciding to stop:
//  1. This repository contains no UPSC CSE source material of any kind (confirmed in Stage 3B-1's
//     search, re-confirmed here).
//  2. This session's network egress proxy blocks outbound access outright — attempting to fetch
//     the official UPSC previous-question-papers PDF (upsc.gov.in) returned
//     "EGRESS_BLOCKED: Access to upsc.gov.in is blocked by the network egress proxy," and a
//     control attempt at an unrelated, non-UPSC reference domain (en.wikipedia.org) returned the
//     identical EGRESS_BLOCKED error — confirming this is a blanket environment restriction, not
//     a UPSC-specific block worth working around.
//  3. With no reachable authoritative source and no in-repo source, the only way to populate this
//     file would be reconstructing exam questions from unverified memory — which is strictly worse
//     than the coaching-site reconstructions this stage explicitly forbids treating as official,
//     since it cannot even cite an attempted source. That is fabrication, not a pilot import, and
//     is exactly what this stage's STOP clause exists to prevent.
//
// This file exists — rather than being skipped entirely — so the workspace/data registry
// (data/registry.ts) and the UPSC CSE PYQ pages already resolve to a real, correctly-typed, empty
// PYQ[] now. Stage 3B-2B (or whenever an authoritative source is actually reachable — e.g. a
// session with working network access to upsc.gov.in, or source material supplied directly) can
// populate this array with zero further plumbing changes anywhere else in the app.
//
// Only OBJECTIVE (Prelims-style) questions belong in this array at all: PYQ's `options`/
// `correctOptionId` are mandatory, so a descriptive Mains question can never be represented here
// without fabricating an answer key — see lib/types.ts's DescriptiveExamQuestion for the type this
// stage proposes (but does not populate or wire up) for that case instead.
export const UPSC_CSE_PYQ_BANK: PYQ[] = [];
