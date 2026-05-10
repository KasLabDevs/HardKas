# HardKAS Security Model

HardKAS is designed as a **Kaspa-native developer operating environment**. It prioritizes developer speed, operational explainability, and deterministic workflows.

## 1. Operational Guardrails

### Simulation vs. Real Isolation
HardKAS enforces a strict logical boundary between **Simulated** and **Real** environments.
- **Simulated artifacts** cannot be signed with real mainnet/testnet keys.
- **Real artifacts** cannot be injected into simulation flows without explicit conversion.
- Lineage verification detects **Mode Contamination** (e.g., trying to use a simulated snapshot as a parent for a mainnet transaction).

### Mainnet Opt-in
Signing for `mainnet` requires the explicit flag `--allow-mainnet-signing`. This prevents accidental broadcast of transactions built in a developer context.

## 2. Key Management

### Encrypted Keystore
HardKAS provides a local, password-protected keystore (`hardkas accounts real init`).
- Private keys are encrypted using **AES-256-GCM**.
- Plaintext keys are only held in memory during the signing operation and are never persisted.
- **WARNING**: HardKAS is NOT a production custody solution. For high-value operations, always use a dedicated hardware wallet or air-gapped system.

## 3. Artifact Integrity

### Content Hashing
Every artifact (Snapshot, TxPlan, SignedTx, Receipt) is cryptographically bound by a **Content Hash**.
- Canonical serialization ensures that identical operational states produce identical hashes.
- Tampering with any field (e.g., amount, recipient, fee) invalidates the hash.

### Lineage Proofs
Lineage IDs and Parent IDs create an audit trail from the initial state (Snapshot) to the final confirmation (Receipt).
- **Strict Verification** ensures that every step in a transaction flow is cryptographically linked to its predecessor.
- **Provenance Audit**: You can verify exactly which snapshot a transaction was built against.

## 4. RPC & Network Confidence

### RPC Resilience
HardKAS includes a resilience layer that tracks endpoint health, latency, and synchronization (DAA Score).
- **Confidence Scoring**: Each endpoint is assigned a score. Low-confidence endpoints (stale or slow) are automatically deprioritized.
- **Circuit Breakers**: Repeated failures trigger a circuit breaker to prevent system-wide stalls.

## 5. Non-Custodial Principles
HardKAS is non-custodial. You control your keys and your artifacts. The tool only facilitates the construction and auditing of the operational flow.
