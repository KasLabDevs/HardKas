# Qualification & Evidence Levels

HardKAS enforces a strict separation between **Maturity** (what we claim a feature is ready for) and **Evidence Level** (how the feature is actually tested).

A feature can be 100% complete in code, but if it lacks the corresponding evidence, it cannot be promoted to a higher qualification level.

## 1. Evidence Level Model

Evidence levels define *what environment* a feature has been proven to work in.

* **L0 — Static / Unit:** The code compiles, types are correct, and unit tests pass with mocked dependencies.
* **L1 — Component:** The feature works in isolation or with controlled HardKAS internal dependencies. No blockchain simulation.
* **L2 — Simulator:** The feature executes successfully against the HardKAS Simulator (virtual DAG, virtual state, synchronous execution). This proves the orchestration logic works deterministically.
* **L3 — Localnet:** The feature executes successfully against a real Kaspa node running locally (`toccata-v2` or similar). This proves it can handle real Kaspa consensus, real RPC, and real UTXO maturity.
* **L4 — Testnet:** The feature is continuously or manually verified against the public Kaspa Testnet (e.g., `testnet-10`). Proves public network latency, external peer propagation, and integration with public infrastructure.
* **L5 — Mainnet:** Production evidence. Live use on Kaspa Mainnet with real value, security reviews, and operational burn-in.

### Mock Honesty
Mocks prove HardKAS behavior around the mocked boundary. **Mocks do NOT prove the external system.** An `e2e` test that mocks the Kaspa RPC is an `L1` or `L2` test, **never** an `L3` test.

## 2. Maturity Model

Maturity defines the project's confidence in the capability, bounded by its Evidence Level.

* **IMPLEMENTED:** The code exists. May only have L0 or L1 evidence.
* **TESTED:** The feature has comprehensive coverage. Typically L2 (Simulator) evidence.
* **QUALIFIED:** The feature behaves correctly on real infrastructure. Requires L3 (Localnet) or L4 (Testnet) evidence.
* **PRODUCTION-QUALIFIED:** The feature is stable, audited, fuzz-tested, and safe for Mainnet (L5).

**Critical Rule:** Evidence level ≠ maturity. 
*Example: A feature can be `IMPLEMENTED` and `TESTED` (L2), but if it lacks L3 evidence, it is NOT `QUALIFIED` for real-node use.*

## 3. Core Qualification (Golden Core vs CQ)

The "Golden Core" is the fundamental transaction lifecycle: `fund → plan → sign → send → receipt → evidence`.

A successful **Demo** of the Golden Core (e.g., running `hardkas localnet` manually) proves that it *can* work.
**Core Qualification (CQ)** requires explicit, automated assertions for the architectural requirements (CQ-01 through CQ-15). 

Qualification requires evidence, not just an anecdotal demo.

## 4. Documentation as a Qualification Consumer

**Documentation communicates qualification; it does not manufacture it.**
If a capability lacks automated L3 evidence, the documentation must mark it as `L2`, regardless of whether a developer ran it successfully on Localnet once.
