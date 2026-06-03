# HardKAS

Deterministic transaction infrastructure for Kaspa applications.

Build workflows that can be:
- replayed
- verified
- audited
- explained

"HardKAS does not make transactions safer by trusting more code. It makes them safer by making every step reproducible."

---

## Why?

**Normal apps:**  
`request` → `mutation` → `hope`

**HardKAS:**  
`intent` → `artifact` → `verification` → `execution` → `replay`

Instead of submitting raw payloads and hoping the network accepts them, HardKAS forces your application to declare intent as a deterministic **Artifact**. This artifact is validated locally via a Zero-Trust hash check before being simulated, sent, and finally receipted. If something fails, you don't guess—you replay the exact artifact to trace the state divergence.

---

## 30 Second Example

```typescript
import { Hardkas } from '@hardkas/sdk';

const sdk = await Hardkas.create({ network: 'simulated' });

// 1. Declare intent
const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '10' });

// 2. Sign deterministic artifact
const signed = await sdk.tx.sign(plan, 'alice');

// 3. Execute and capture receipt
const receipt = await sdk.tx.send(signed);

// 4. Cryptographically prove equivalence
await sdk.replay.verify(receipt);
```
*(Source: `examples/basic-transfer`)*

---

## Core Concepts

### Artifacts
Immutable JSON files representing a specific state machine transition (Plan, Signed, Receipt). They use canonical JSON hashing to ensure cross-platform deterministic equivalence.

### Lineage
The cryptographic DAG (Directed Acyclic Graph) of artifacts. A receipt guarantees it came from a specific signed transaction, which guarantees it came from a specific plan.

### Replay
The engine that reads a historical artifact and reconstructs the precise local environment (UTXOs, timestamps) to prove that the execution was deterministic and untampered.

### Query Store
A high-performance local indexer (SQLite) built automatically by traversing your `.hardkas/artifacts/` folder, ensuring `O(1)` lookups without relying on an external database.

### Policies
Strict mathematical constraints (e.g., "Amount must be < 100", "Must involve a multisig node") applied during the `verify` phase to block adversarial artifacts before execution.

---

## Guarantees

- [x] **Deterministic hashing:** Canonical serialization ensures Windows and Linux produce the exact same `contentHash`.
- [x] **Tamper detection:** `artifacts.verify()` dynamically recalculates hashes in memory, preventing modified JSON from bypassing checks.
- [x] **Crash recovery:** If the process dies midway, the `query store rebuild` command deterministically restores the exact state from the filesystem.
- [x] **Forward safety:** The system will safely reject (`SAFE_REJECT_UNSUPPORTED`) incompatible legacy artifacts without corrupting the local workspace index.

---

## What HardKAS is not

- **Not a wallet:** HardKAS does not manage seeds securely for users. It is infrastructure for builders.
- **Not consensus:** It does not invent new cryptographic primitives. It strictly adheres to Kaspa's transaction formats.
- **Not replacing Kaspa nodes:** You still need RPC nodes to broadcast to mainnet. HardKAS just ensures your local payloads are mathematically sound before you do.

---

## Production Status

- **Version:** `0.9 beta candidate`
- **API Status:** API freeze starting.
- **Audits:** Core Crypto ✅, Artifact Safety ✅, State Machine ✅, Persistence ✅, Backward Safety ✅, Long Runtime ⏳ (Soak pending).

*(See [docs/](docs/) for full architectural guides and security claims).*
