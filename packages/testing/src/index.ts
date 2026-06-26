// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — Semantic Test Framework for HardKAS.

// ── Test Harness ─────────────────────────────────────────────────────────────
export type { HarnessConfig, TestHarness, SendResult } from "./harness.js";
export {
  createTestHarness,
  enableMassTracking,
  disableMassTracking,
  getMassRecords,
  clearMassRecords
} from "./harness.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────
export type { FixtureDefinition } from "./fixtures.js";
export { createFixture } from "./fixtures.js";

// ── Matchers ─────────────────────────────────────────────────────────────────
export type { HardKasMatchers } from "./matchers.js";
export { hardKasMatchers } from "./matchers.js";

// ── Setup (side-effect import) ──────────────────────────────────────────────
// Avoid auto-importing setup.js in index.ts because it pulls in vitest and causes
// "Vitest failed to access its internal state" when executed by the CLI in non-test runs.
// Test runners should import "@hardkas/testing/setup" explicitly instead.

// ── Reproducibility Proof ───────────────────────────────────────────────────
export type { ReproducibilityReport } from "./reproducibility.js";
export { generateReproducibilityReport } from "./reproducibility.js";

// ── Adversarial Validation ──────────────────────────────────────────────────
export { AdversarialFixtures } from "./adversarial-fixtures.js";

// ── Scenarios ────────────────────────────────────────────────────────────────
// Test scenarios are exported from "@hardkas/testing/scenarios" to avoid loading vitest in non-test contexts.

// ── Torture Suite ────────────────────────────────────────────────────────────
export type {
  TortureCaseResult,
  TortureBucketContext,
  TortureBucket
} from "./torture/torture-engine.js";
export {
  LcgPrng,
  getAllTortureBuckets,
  getTortureBucket,
  TortureInvariantError
} from "./torture/torture-engine.js";
import "./torture/buckets.js";
import "./torture/local-buckets.js";
import "./torture/corruption-buckets.js";
