// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// Pre-defined DAG scenarios for simulation and education.

import { createHash } from "node:crypto";
import type { BlockHash, SimBlock } from "./ghostdag-types.js";
import { GENESIS_HASH } from "./ghostdag-types.js";
import { GhostdagStore, genesisGhostdagData } from "./ghostdag-store.js";
import { ApproxGhostdagEngine } from "./ghostdag-engine.js";
import type { DagMetrics } from "./metrics.js";
import { computeDagMetrics } from "./metrics.js";

export interface ScenarioConfig {
  /** Scenario name. */
  name: string;
  /** GHOSTDAG K parameter. */
  k?: number;
  /** Number of blocks to generate (excluding genesis). */
  blockCount: number;
  /** Difficulty bits for all blocks. */
  bits?: number;
}

export interface ScenarioResult {
  name: string;
  config: ScenarioConfig;
  metrics: DagMetrics;
  /** Time to compute in milliseconds. */
  computeTimeMs: number;
}

function scenarioBlockHash(scenario: string, index: number): string {
  return createHash("sha256").update(`${scenario}:${index}`).digest("hex");
}

/**
 * Creates a block for simulation.
 * Intentionally uses Date.now() for timestampUs as this is a research-grade
 * approximation and doesn't affect canonical hashing of simulated artifacts.
 */
function createBlock(hash: BlockHash, parents: BlockHash[], bits: number): SimBlock {
  return {
    header: {
      hash,
      parents,
      timestampUs: Date.now() * 1000, // Not deterministic but used for simulation
      minerId: 0,
      bits,
      nonce: 0,
    }
  };
}

export function runLinearChain(config: ScenarioConfig): ScenarioResult {
  const start = performance.now();
  const blocks = new Map<BlockHash, SimBlock>();
  const store = new GhostdagStore();
  const engine = new ApproxGhostdagEngine(config.k ?? 18);
  const bits = config.bits ?? 1000;

  // Genesis
  const genesis: SimBlock = createBlock(GENESIS_HASH, [], bits);
  blocks.set(GENESIS_HASH, genesis);
  store.insert(GENESIS_HASH, genesisGhostdagData(GENESIS_HASH));

  let prevHash = GENESIS_HASH;
  for (let i = 0; i < config.blockCount; i++) {
    const hash = scenarioBlockHash(config.name, i);
    const block = createBlock(hash, [prevHash], bits);
    blocks.set(hash, block);
    
    const gdData = engine.computeGhostdag(block, blocks, store);
    store.insert(hash, gdData);
    prevHash = hash;
  }

  const metrics = computeDagMetrics(blocks, store, GENESIS_HASH);
  return {
    name: config.name,
    config,
    metrics,
    computeTimeMs: performance.now() - start
  };
}

export function runWideDag(config: ScenarioConfig): ScenarioResult {
  const start = performance.now();
  const blocks = new Map<BlockHash, SimBlock>();
  const store = new GhostdagStore();
  const engine = new ApproxGhostdagEngine(config.k ?? 18);
  const bits = config.bits ?? 1000;

  // Genesis
  blocks.set(GENESIS_HASH, createBlock(GENESIS_HASH, [], bits));
  store.insert(GENESIS_HASH, genesisGhostdagData(GENESIS_HASH));

  const siblingCount = config.blockCount - 1;
  for (let i = 0; i < siblingCount; i++) {
    const hash = scenarioBlockHash(config.name, i);
    const block = createBlock(hash, [GENESIS_HASH], bits);
    blocks.set(hash, block);
    
    const gdData = engine.computeGhostdag(block, blocks, store);
    store.insert(hash, gdData);
  }

  // To actually see red blocks, we need a block that merges all these siblings.
  const siblingHashes = Array.from(blocks.keys()).filter(h => h !== GENESIS_HASH);
  const mergerHash = scenarioBlockHash(config.name, 9999);
  const mergerBlock = createBlock(mergerHash, siblingHashes, bits);
  blocks.set(mergerHash, mergerBlock);
  store.insert(mergerHash, engine.computeGhostdag(mergerBlock, blocks, store));


  const metrics = computeDagMetrics(blocks, store, GENESIS_HASH);

  return {
    name: config.name,
    config,
    metrics,
    computeTimeMs: performance.now() - start
  };
}

export function runForkResolution(config: ScenarioConfig & { forkPoint: number }): ScenarioResult {
  const start = performance.now();
  const blocks = new Map<BlockHash, SimBlock>();
  const store = new GhostdagStore();
  const engine = new ApproxGhostdagEngine(config.k ?? 18);
  const bits = config.bits ?? 1000;

  // Genesis
  blocks.set(GENESIS_HASH, createBlock(GENESIS_HASH, [], bits));
  store.insert(GENESIS_HASH, genesisGhostdagData(GENESIS_HASH));

  // Common trunk
  let forkHash = GENESIS_HASH;
  for (let i = 0; i < config.forkPoint; i++) {
    const hash = scenarioBlockHash(config.name + "-trunk", i);
    const block = createBlock(hash, [forkHash], bits);
    blocks.set(hash, block);
    const gdData = engine.computeGhostdag(block, blocks, store);
    store.insert(hash, gdData);
    forkHash = hash;
  }

  // Fork A
  const branchLength = Math.floor((config.blockCount - config.forkPoint) / 2);
  let prevA = forkHash;
  for (let i = 0; i < branchLength; i++) {
    const hash = scenarioBlockHash(config.name + "-forkA", i);
    const block = createBlock(hash, [prevA], bits);
    blocks.set(hash, block);
    const gdData = engine.computeGhostdag(block, blocks, store);
    store.insert(hash, gdData);
    prevA = hash;
  }

  // Fork B - slightly more blocks or higher work to win? 
  // We'll make it equal length but GHOSTDAG should pick one (by hash tie-break if work equal)
  let prevB = forkHash;
  const branchBLength = config.blockCount - config.forkPoint - branchLength;
  for (let i = 0; i < branchBLength; i++) {
    const hash = scenarioBlockHash(config.name + "-forkB", i);
    const block = createBlock(hash, [prevB], bits);
    blocks.set(hash, block);
    const gdData = engine.computeGhostdag(block, blocks, store);
    store.insert(hash, gdData);
    prevB = hash;
  }

  const metrics = computeDagMetrics(blocks, store, GENESIS_HASH);
  return {
    name: config.name,
    config,
    metrics,
    computeTimeMs: performance.now() - start
  };
}

export function runDiamondDag(config: ScenarioConfig): ScenarioResult {
  const start = performance.now();
  const blocks = new Map<BlockHash, SimBlock>();
  const store = new GhostdagStore();
  const engine = new ApproxGhostdagEngine(config.k ?? 18);
  const bits = config.bits ?? 1000;

  // Genesis
  blocks.set(GENESIS_HASH, createBlock(GENESIS_HASH, [], bits));
  store.insert(GENESIS_HASH, genesisGhostdagData(GENESIS_HASH));

  let prevMerge = GENESIS_HASH;
  const cycles = Math.floor(config.blockCount / 3);
  for (let i = 0; i < cycles; i++) {
    // Parallel blocks
    const hashA = scenarioBlockHash(config.name + "-A", i);
    const blockA = createBlock(hashA, [prevMerge], bits);
    blocks.set(hashA, blockA);
    store.insert(hashA, engine.computeGhostdag(blockA, blocks, store));

    const hashB = scenarioBlockHash(config.name + "-B", i);
    const blockB = createBlock(hashB, [prevMerge], bits);
    blocks.set(hashB, blockB);
    store.insert(hashB, engine.computeGhostdag(blockB, blocks, store));

    // Merge block
    const hashM = scenarioBlockHash(config.name + "-M", i);
    const blockM = createBlock(hashM, [hashA, hashB], bits);
    blocks.set(hashM, blockM);
    store.insert(hashM, engine.computeGhostdag(blockM, blocks, store));
    
    prevMerge = hashM;
  }

  const metrics = computeDagMetrics(blocks, store, GENESIS_HASH);
  return {
    name: config.name,
    config,
    metrics,
    computeTimeMs: performance.now() - start
  };
}

export function runAllScenarios(config: ScenarioConfig): ScenarioResult[] {
  return [
    runLinearChain({ ...config, name: config.name + ":linear" }),
    runWideDag({ ...config, name: config.name + ":wide" }),
    runForkResolution({ ...config, name: config.name + ":fork", forkPoint: Math.floor(config.blockCount / 2) }),
    runDiamondDag({ ...config, name: config.name + ":diamond" }),
  ];
}
