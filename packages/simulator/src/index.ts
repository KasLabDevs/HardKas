// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// @hardkas/simulator — GHOSTDAG approximate simulation engine.
//
// This module provides a structural approximation of GHOSTDAG
// for use in HardKAS localnet simulation. It is NOT consensus-canonical.
// No semantic equivalence with rusty-kaspa is claimed.
//
// Translated from kaspa-sim (Rust) — github.com/KasLabDevs/kaspa-sim

// ── Existing exports (TxSimulator, lifecycle phases) ─────────────────────────
export type {
  TxLifecyclePhase,
  TxTraceEvent,
  SimulationResult,
} from "./tx-simulator.js";
export { TxSimulator, createTraceId } from "./tx-simulator.js";

// ── GHOSTDAG Types ───────────────────────────────────────────────────────────
export type {
  BlockHash,
  BlueWorkType,
  GhostdagData,
  CompactGhostdagData,
  SimBlockHeader,
  SimBlock,
} from "./ghostdag-types.js";

export {
  GENESIS_HASH,
  blockHash,
  blockParents,
  blockBlueWork,
  blockBlueScore,
  headerWork,
  compactFromFull,
} from "./ghostdag-types.js";

// ── GHOSTDAG Ordering ────────────────────────────────────────────────────────
export type { SortableBlock } from "./ordering.js";
export { compareSortableBlocks, sortBlocks, findSelectedParent } from "./ordering.js";

// ── GHOSTDAG Store ───────────────────────────────────────────────────────────
export { GhostdagStore, genesisGhostdagData } from "./ghostdag-store.js";

// ── Reachability & Mergeset ──────────────────────────────────────────────────
export {
  pastSet,
  isDagAncestorOf,
  unorderedMergesetWithoutSelectedParent,
  orderedMergesetWithoutSelectedParent,
} from "./reachability.js";

// ── Approximate GHOSTDAG Engine ──────────────────────────────────────────────
export type { CandidateColor } from "./ghostdag-engine.js";
export { ApproxGhostdagEngine, DEFAULT_K } from "./ghostdag-engine.js";

// ── Metrics ──────────────────────────────────────────────────────────────────
export type { DagMetrics } from "./metrics.js";
export { computeDagMetrics } from "./metrics.js";

// ── Scenarios ────────────────────────────────────────────────────────────────
export type { ScenarioConfig, ScenarioResult } from "./scenarios.js";
export {
  runLinearChain,
  runWideDag,
  runForkResolution,
  runDiamondDag,
  runAllScenarios,
} from "./scenarios.js";

// ── Report ───────────────────────────────────────────────────────────────────
export { formatScenarioReport } from "./report.js";

// ── Mass Profiling ───────────────────────────────────────────────────────────
export type { MassBreakdown, MassComparison } from "./mass-profile.js";
export { profileMass, compareMassProfiles, formatMassProfile, formatMassComparison } from "./mass-profile.js";

// ── Mass Snapshots ──────────────────────────────────────────────────────────
export type { MassSnapshot, MassSnapshotStore } from "./mass-snapshot.js";
export { saveMassSnapshot, loadMassSnapshot, profileAndCompare } from "./mass-snapshot.js";


