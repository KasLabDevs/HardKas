# Failure Taxonomy

HardKAS enforces a strictly typed error architecture (`HardkasCliError`). Rather than generating generic stack traces, the CLI surfaces machine-readable error codes mapped to specific operational failures.

## The Canonical Diagnostic Matrix

When a command fails, match the returned error code to its operational boundary.

### 1. Workspace & Configuration
* **`WORKSPACE_NOT_FOUND`**: The command was executed outside a valid HardKAS workspace.
* **`LOCALNET_PROFILE_REQUIRED`**: Attempted to start a node without specifying the topology (e.g., missing `--profile toccata-v2`).

### 2. Node & RPC Boundaries
* **`NODE_NOT_RUNNING`**: The managed localnet node is not active.
* **`RPC_NOT_READY` / `CONNECTION_REFUSED`**: HardKAS cannot reach the RPC endpoint. Usually means the node crashed or the port mapping is incorrect.
* **`TIMEOUT`**: The node is reachable but hanging (often due to intense local I/O or a massive RPC payload).
* **`RPC_SCHEMA_ERROR`**: The node rejected the request shape. This often indicates a version mismatch between the HardKAS SDK and the Kaspa Node (e.g., sending v1 transaction fields to a pre-Toccata node).

### 3. Accounts & Signing
* **`INVALID_PRIVATE_KEY_MATERIAL`**: The provided key string is not a valid 64-character hex scalar.
* **`ACCOUNT_NETWORK_MISMATCH`**: You are trying to use an account bound to one network (e.g., `mainnet`) in a transaction targeting another (e.g., `simnet`). HardKAS strict mode rejects this.
* **`SIGNER_ERROR`**: Failed to produce a valid signature (often due to mismatched inputs or PSKT misalignment).

### 4. Planning & UTXO Management
* **`INSUFFICIENT_FUNDS`**: The UTXOs available to the account do not cover the requested amount + fee.
* **`FEE_CONVERGENCE_ERROR`**: The transaction planner could not stabilize a UTXO selection for the required fee (often occurs with severe UTXO fragmentation and high network fees).
* **`COINBASE_MATURITY_UNRESOLVED`**: Attempted to spend a minted coinbase UTXO that hasn't reached the required DAA block depth (maturity).

### 5. Artifacts & Evidence
* **`INTEGRITY_FAILED`**: The `contentHash` of the artifact does not match its contents, implying the file was manually edited or corrupted.
* **`VERIFICATION_FAILED`**: The provenance chain of the artifact (e.g., SilverScript compilation) cannot be perfectly reproduced.
* **`REPLAY_DIVERGED`**: Replaying a recorded workflow (`events.jsonl`) produced a different outcome than originally recorded.

### 6. Submission & Finality
* **`POLLING_ERROR`**: `hardkas tx wait` failed to query the node for confirmation.
* **`CONFIRMATION_TIMEOUT`**: The transaction was submitted, but the node did not mine it into a block within the timeout. (Is the localnet miner running?)

---

By mapping the exact `code` to this taxonomy, you immediately isolate whether you have a network problem, a cryptographic problem, or a state problem.
