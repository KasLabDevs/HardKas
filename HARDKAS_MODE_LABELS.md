# HardKAS Execution Mode Labels

HardKAS operations are strictly categorized into execution modes. These labels appear in standard JSON output envelops to clearly declare the nature of the execution, ensuring the user and any automated CI pipelines understand exactly what boundaries and assumptions were in play.

## 1. SIMULATED

**Definition:** The execution happened entirely within the local HardKAS Simulator. No real nodes or real network interactions took place.

**Typical Commands:**
- `hardkas accounts fund` (in simulator)
- `hardkas tx simulated`
- `hardkas simulator *`

**Non-Claims:**
- Does not represent a finalized transaction on any Kaspa network.
- Does not guarantee mainnet validity, mempool acceptance, or consensus equivalent execution.

## 2. LOCAL_DOCKER

**Definition:** The execution interacted with a local Dockerized node, such as the `rusty-kaspad` Toccata release or a standard Kaspa node.

**Typical Commands:**
- `hardkas localnet start --toccata`
- `hardkas localnet fund --toccata`
- `hardkas localnet status`
- `hardkas node *`

**Non-Claims:**
- Does not represent production readiness.
- Does not interact with public testnet or mainnet nodes.

## 3. EXPERIMENTAL

**Definition:** The execution invoked capabilities that are under active research and development. Stability is not guaranteed, and the feature is not finalized.

**Typical Commands:**
- `hardkas zk *`
- `hardkas vprogs *`
- `hardkas l2 *`
- `hardkas stable-asset *`
- `hardkas silver *`

**Non-Claims:**
- Not ready for institutional or production use.
- Lacks audits or formal verification.
- Output shapes, formats, and behaviors may break across minor versions.

## 4. NOT_CLAIMED

**Definition:** The operation is generic tooling (e.g., displaying configuration, documentation, parsing artifacts) that does not interact with a runtime, node, or execution environment.

**Typical Commands:**
- `hardkas capabilities`
- `hardkas doctor` (offline checks)
- `hardkas verify`

**Non-Claims:**
- Does not test network conditions, runtime performance, or security assumptions.
