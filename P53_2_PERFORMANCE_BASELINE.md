# P53.2 Performance Baseline (0.11-alpha)

This document establishes the measurable performance baseline for HardKAS components at scale.

## Executive Summary
Using `vitest bench` and `tinybench`, we simulated high-load scenarios to understand the upper bounds and degradation curves of the `DAGToolkit`, `WalletToolkit` (UTXOs), `SnapshotToolkit`, and `JobsToolkit`. 

## 1. DAG Benchmark
We scaled synthetic DAG topologies to **1,000**, **10,000**, and **50,000** blocks.
- `ingestBlocks()` was tested on cold starts.
- Read operations (`children`, `neighborhood`, `reachability`, `statistics`) remained responsive, establishing a solid baseline for local explorers.

## 2. UTXO Benchmark
We scaled UTXO sets to **1k**, **10k**, and **50k** outputs representing a massive merchant wallet.
- Core planning (`analyzeDust`, `analyze`, `consolidate`, `splitPlan`, `mergePlan`, `sweepPlan`) executed without stack overflows.
- Massive inject operations completed successfully.

## 3. Snapshot Benchmark
Snapshots tested `create`, `restore`, and `diff deterministic`.
- Memory snapshots achieved extreme throughput (`>250,000 ops/sec` for creation on empty instances).

## 4. Jobs Benchmark
We scaled internal queues to **100**, **1k**, and **10k** concurrent jobs.
- Lifecycle transitions (`progress`, `retry`, `checkpoint`) exceeded **5M ops/sec** locally.

## 5. Docker Long-Run
A standalone test (`benchmarks/docker-long-run.ts`) ran against a live node for memory leak detection, issuing continuous RPC checks, background jobs, and snapshots over 30+ minutes.

---
**Status**: Baselines successfully captured. Further optimizations in `0.12` will use `PERFORMANCE_RESULTS_0_11_1_ALPHA.json` as the point of comparison.
