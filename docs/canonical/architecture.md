# HardKAS Architectural Invariants Specification

This document defines the core, non-negotiable architectural invariants of the HardKAS runtime. Any modification to the codebase must preserve these invariants to maintain system integrity.

---

## 1. System Authority Axiom: Filesystem = Authority

The filesystem directory containing the `.hardkas/` configuration and JSON transaction artifacts is the **single, absolute canonical source of truth** for workspace state. 

* **The rule**: No memory structure, process cache, or database projection may supersede the filesystem.
* **Why it exists**: Prevents synchronization splits (split-brain) between local helper processes (like SQLite) and actual physical records.
* **Failure mode**: If the database projection drifts or is physically deleted, it must be discarded and fully rebuilt from the JSON artifacts with zero loss of system truth.

---

## 2. Projection Axiom: SQLite = Projection/Cache Only

The SQLite database (`store.db`) is strictly a **transient projection cache** designed solely for fast CLI querying and dashboard visualization.

* **The rule**: No cryptographic authority resides in the database.
* **Why it exists**: Ensures that database optimizations, indexing schemas, or storage compression never pollute the long-term cryptographic record of transactions.
* **Failure mode**: Corruption of the SQLite file must only trigger a "Degraded" visual state. The CLI and SDK core continue executing perfectly by reading JSON files directly.

---

## 3. Boundary Axiom: Replay != Live Consensus Verification

The HardKAS replay engine verifies local causal relationships, mathematical consistency, and semantic policy invariants. It **does NOT** represent live consensus verification on public subnets.

* **The rule**: Replay succeeds when the local transitions are mathematically correct. It makes zero assertions about live Kaspa node acceptance.
* **Why it exists**: Avoids false security claims regarding volatile network properties (mempool congestion, doublespends, network finality).
* **Failure mode**: Live consensus validation in reports is systematically reported as `unimplemented` to preserve strict trust boundaries.

---

## 4. State Invariance: Deterministic Planning Invariant

The plan generator must produce a mathematically identical plan under identical wallet balance states, policy restrictions, and transaction requests.

* **The rule**: Shuffling inputs from RPC response queries has **zero impact** on the selected input set, selected inputs order, recipient output order, plan hashes, or execution outcomes.
* **Why it exists**: Eliminates plan divergence and non-determinism in multi-tenant or multi-platform automated agent runs.
* **Failure mode**: Outpoint lexicographical tie-breaking (`amountSompi ASC -> transactionId ASC -> index ASC`) resolves all equal-value UTXO selection ambiguities.

---

## 5. Workstation Sandboxing Invariant

The dev-server background worker isolates the local host system from external web browser intrusions.

* **The rule**: Every REST mutation or read endpoint and every Server-Sent Event (SSE) channel strictly requires a pre-shared static Bearer Authorization token generated at runtime.
* **Why it exists**: Stops CSRF, Cross-Origin read hijacking, and DNS rebinding attacks launched by third-party browser tabs against the workstation.
* **Failure mode**: Unauthenticated requests are immediately dropped with a `401 Unauthorized` block.
