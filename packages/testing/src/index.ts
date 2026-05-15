// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — Semantic Test Framework for HardKAS.

// ── Test Harness ─────────────────────────────────────────────────────────────
export type { HarnessConfig, TestHarness, SendResult } from "./harness.js";
export { createTestHarness } from "./harness.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────
export type { FixtureDefinition } from "./fixtures.js";
export { createFixture } from "./fixtures.js";

// ── Matchers ─────────────────────────────────────────────────────────────────
export type { HardKasMatchers } from "./matchers.js";
export { hardKasMatchers } from "./matchers.js";

// ── Setup (side-effect import) ──────────────────────────────────────────────
export {} from "./setup.js";

// ── Reproducibility Proof ───────────────────────────────────────────────────
export type { ReproducibilityReport } from "./reproducibility.js";
export { generateReproducibilityReport } from "./reproducibility.js";

// ── Adversarial Validation ──────────────────────────────────────────────────
export { AdversarialFixtures } from "./adversarial-fixtures.js";
