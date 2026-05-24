# HardKas DAG Tooling Audit

## 1. Scope
This audit evaluates the **DAG simulator** and related tools in HardKas (including the `query dag ...` commands and the local state model in `packages/localnet`). The focus includes:
- The deterministic model of the local DAG.
- Reorg simulation logic, sink pathing, and displacement.
- Detection of double-spend conflicts and anomalies.
- Interaction between the Replay engine and the DAG.
- Accuracy and relationship of the HardKas model compared to real Kaspa consensus concepts (GHOSTDAG / DAGKnight).

## 2. Executive Summary
The HardKas "DAG Tooling" **IS NOT A REAL KASPA CONSENSUS SIMULATOR. IT IS NOT GHOSTDAG, NOR DAGKNIGHT, NOR SPECTRE.**

It is a **deterministic-light-model** designed purely for **developer debugging, conflict visualization, and replay testing**. [UPDATED] It now implements a functional approximation of GHOSTDAG (ApproxGhostdagEngine) for topological ordering and selected parent calculation.

**System Classification:**
- DAG tooling maturity: **EXPERIMENTAL / RESEARCH**
- Consensus accuracy: **WEAK** (Intentionally heuristic)
- Deterministic replay support: **GOOD**
- Conflict analysis: **GOOD** (UTXO-based)
- Reorg simulation: **PARTIAL** (Manual test-oriented simulation)
- Research maturity: **GOOD** (Provides deep introspection)

## 3. DAG Command Inventory

| Command | Purpose | Source | Maturity | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `query dag conflicts` | Shows winners and losers of a double-spend | `query/dag-adapter.ts` | RESEARCH | Based on the local DAG's `conflictSet` |
| `query dag displaced` | Lists txs that lost their place in consensus | `query/dag-adapter.ts` | RESEARCH | Compares accepted vs displaced sets |
| `query dag history` | Tx history in the DAG | `query/dag-adapter.ts` | RESEARCH | Scans blocks to trace the life cycle |
| `query dag sink-path` | Traversal from sink to genesis | `query/dag-adapter.ts` | RESEARCH | Simple heuristic of parents[0] |
| `query dag anomalies` | Detects logical invariant violations | `query/dag-adapter.ts` | RESEARCH | Verifies orphan txs or unreachable blocks |
| `dag status` | Shows local DAG status | `dag-runners.ts` | PARTIAL | - |
| `dag simulate-reorg`| Creates an artificial fork and moves the sink | `dag-runners.ts` | PARTIAL | Localnet only |

## 4. DAG Model Architecture

| DAG Area | Current behavior | Risk | Notes |
| :--- | :--- | :--- | :--- |
| Node Representation | `SimBlock` with `id`, `parents[]`, `daaScore`, and `acceptedTxIds`. | LOW | Simplified structure persisted in JSON |
| Edge Representation | Chains of parent block IDs. | LOW | Basic DAG |
| Selected Parent | [OUTDATED FINDING RESOLVED] Now uses GHOSTDAG blue work calculation via `ApproxGhostdagEngine`. | LOW | - |
| Persistence | Persisted in `state.json` (`localnet/state.ts`) | LOW | Ideal for deterministic testing |

## 5. Reorg Simulation Audit

| Feature | Present | Deterministic | Accuracy | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Displacement detection | YES | YES | Heuristic | LOW |
| Reorg trigger | YES (via manual command) | YES | Low | LOW |
| Set evaluation | NO | N/A | Fails | HIGH |

The `simulate-reorg` command creates a side-block and executes the `moveSink()` function. The logic then re-calculates accepted transactions by iterating in topological order from the new sink backward. **It is deterministic but not cryptoeconomically exact**.

## 6. Sink Path Logic Audit

| Area | Implementation | Deterministic | GHOSTDAG accuracy | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Sink Definition | Manual pointer in state (`dag.sink`) | YES | Poor | In Kaspa, the virtual sink is calculated by consensus |
| Sink Path Calculation | `calculateSelectedPath` iterates using `parents[0]` | YES | Poor | Does not implement K-clusters or blue/red coloring |
| Topological Stability | YES. Uses `daaScore` + Lexicographical | YES | Medium | Ensures reproducible ordering in tests |

## 7. Displacement Logic Audit

| Displacement feature | Present | Model | Risk |
| :--- | :--- | :--- | :--- |
| Displaced transactions | YES | `acceptedTxIds` vs `displacedTxIds` arrays | LOW |
| Conflict resolution | YES | Priority: 1) sink-path, 2) daaScore, 3) lexicographical txId | LOW |
| Replay impact | YES | `correlate.ts` warns when a Tx in the plan was displaced | LOW |

## 8. Conflict Model Audit
Double-spend conflict analysis is purely local and based on UTXOs.

| Conflict type | Supported | Accuracy | Deterministic | Notes |
| :--- | :--- | :--- | :--- | :--- |
| UTXO Double-spend | YES | High | YES | If two txs use the same outpoint, one loses |
| Parallelism without conflict| YES | High | YES | Both txs enter the block |
| Ordering conflict| YES | Medium| YES | Depends on lexicographical tie-break for daaScore ties |

## 9. Anomaly Detection Audit
Anomalies are calculated in `executeAnomalies` by scanning simulator invariants:

| Anomaly | Detection | Deterministic | Reliability |
| :--- | :--- | :--- | :--- |
| `displaced-never-reaccepted` | Txs lost forever | YES | High (in local context) |
| `unreachable-block` | Nodes disconnected from the sink | YES | High |
| `invariant-violation` | Tx in both arrays at once | YES | High |

## 10. Replay Integration Audit

| Replay feature | DAG integration | Risk |
| :--- | :--- | :--- |
| Context Injection | `applySimulatedPayment` embeds `dagContext` in the `txReceipt` | LOW |
| Cross-domain Correlate| `correlate.ts` links Lineage + DAG status + Replay Invariants | LOW |

Integration is passive: Replay reads the local DAG state and notes the mode existing at that moment in its receipt.

## 11. Determinism Review

**Same artifacts + same replay = same DAG analysis?**  
👉 **YES.**

The simulator has been mathematically hardened for test determinism:
1. Transactions generate identical hashes (`generateDeterministicTxId`) given the same plan and `daaScore`.
2. `resolveConflictsDeterministically` always breaks ties using the lexicographical order of `txId`.
3. There is no temporal dependency in graph assembly.

## 12. Consensus Accuracy Review
Strict comparison with the real Kaspa protocol:

| Consensus Feature | HardKas DAG Tooling | Real Kaspa Consensus |
| :--- | :--- | :--- |
| **Blue Score / Red Score** | NO (Only an incremental base counter) | YES (Based on K-clusters and merge sets) |
| **Selected Parent** | Naive heuristic (`parents[0]`) | GHOSTDAG calculation weighted by network weight |
| **Merge Sets** | NO | Central to ordering resolution |
| **Determinism** | YES (Absolute for offline testing) | YES (Eventual / Stochastic by network) |

## 13. Performance Review
- **Complexity:** Topological traversal assumes in-memory BFS (`identifyReachableBlocks`).
- **Scale:** Optimal for hundreds of blocks in a local test, but would collapse under O(N) memory for mainnet sizes. This is intentional and correct for "Localnet tooling".

## 14. Findings

### GOOD
- **Strict Determinism:** Excellent tool for CI/CD and wallet resilience testing against forced reorgs.
- **Tooling Transparency:** The `correlate` command offers an impressive 360-degree view joining DAG, Lineage, and Replays.
- **UTXO Analysis:** Double-spend conflict resolution is robustly implemented at the semantic level.

### NEEDS HARDENING
- **Terminology Ambiguity:** The CLI prominently exposes "DAG" commands, which could confuse a novice developer into believing HardKas verifies Kaspa's cryptographic consensus.
- **Lack of Real Merge Sets:** By not calculating merge sets, reorg simulation does not illustrate the beauty of GHOSTDAG's parallel confirmation, behaving more like a linear blockchain with simple side branches.

## 15. Recommendations

### P0 — Clarify Research Status
- Add banners (like the current `DAG_MODEL_WARNING`) not only to queries but also to the main documentation. Explicitly mark as `LIGHT-MODEL / NOT CONSENSUS`.

### P1 — Deterministic DAG Core
- Formalize `resolveConflictsDeterministically` rules in the documentation so developers understand how ties are broken (sink-path > daaScore > txId).

### P2 — Better Replay Integration
- Save *DAG Snapshots* (not just the `dagContext` string) attached to failed replays to inspect the exact graph at the time of a divergence.

### P3 — Advanced Research
- **GHOSTDAG Approximation**: [OUTDATED FINDING RESOLVED] Implemented `ApproxGhostdagEngine` to provide better topological stability and concept alignment with real Kaspa.

## 16. Proposed DAG Tooling v1
The goal in v1 is not to pretend to be a Kaspa node.
- The CLI should present these commands grouped under `hardkas query dag` or keep the `[RESEARCH: LIGHT-MODEL]` tag ultra-visible.
- Redesign `SimBlock` to include a simulated `mergeSet: string[]` field, improving developer visual understanding.

## 17. Tests Recommended
- `deterministic sink path`: lexicographical invariant test.
- `displaced tx detection`: force depth N reorg and validate arrays.
- `double-spend conflict`: validate that the winning txId matches the lexicographical specification.
- `same artifacts => same DAG analysis`: CI/CD integration.
- `lineage+DAG consistency`: Correlate a parent-child artifact under reorg.

## 18. Final Assessment
**What is DAG tooling really today?**
It is a deterministic emulator of reorgs and double-spends for developers writing transaction pipelines (planners).

**What is it NOT?**
It is not a block validator, nor an implementation of the GHOSTDAG paper, nor does it serve to evaluate real Kaspa protocol attacks. It serves wonderfully as a complex *mocking* tool for applications that need to test their tolerance for logical network failures without depending on a Kaspa Testnet node.

## 19. Checklist
- [x] Reorg simulation
- [x] Sink path logic
- [x] Displacement logic
- [x] Conflict model
- [x] Anomaly detection
- [x] No modifications to runtime logic
- [x] No modifications to DAG engine
- [x] No modifications to query engine
- [x] Documentary audit only

## Guardrails
- Runtime logic was not modified.
- DAG tooling was not modified.
- QueryEngine was not modified.
- Localnet was not modified.
- This audit is purely documentary, analyzing accuracy against papers and its current implementation in code.
