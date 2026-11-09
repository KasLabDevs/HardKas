---
title: hardkas tx
---

# `hardkas tx`

## `hardkas tx profile`

### Synopsis (Generated)

**Purpose:** Show detailed mass and fee breakdown for a transaction plan stable

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx batch`

### Synopsis (Generated)

**Purpose:** Process a batch of transactions sequentially stable

#### Options

- `--file &lt;path&gt;`: Path to JSON file containing batch payments
- `--network &lt;name&gt;`: Network name
- `--workspace &lt;path&gt;`: Override workspace root directory
- `--password-env &lt;env&gt;`: Read the keystore password of the batch's encrypted payers from this environment variable (read once, before the first payment)
- `--password-stdin` (Default: `false`): Read the keystore password of the batch's encrypted payers from stdin (read once, before the first payment)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx plan`

### Synopsis (Generated)

**Purpose:** Build a transaction plan artifact stable

#### Arguments

- `&lt;from&gt;` (Optional): 
- `&lt;to&gt;` (Optional): 

#### Options

- `--target &lt;name&gt;`: Named execution target from hardkas.config.ts
- `--from &lt;accountOrAddress&gt;`: Sender account name or address (default: alice)
- `--to &lt;address&gt;`: Recipient address or account name (default: bob)
- `--amount &lt;kas&gt;`: Amount in KAS, up to 8 decimals (default: 1)
- `--network &lt;name&gt;`: simulated, simnet, devnet, testnet-10, testnet-12 or mainnet (default: the config's default target)
- `--fee-rate &lt;sompiPerMass&gt;`: Whole sompi per gram of mass, at least 1 (default: 1 in the simulator, 100 on real networks; not a live estimate)
- `--max-fee &lt;sompi&gt;`: Total fee limit in sompi: the plan is refused (FEE_EXCEEDS_MAX) above it, and the limit is recorded in the plan and enforced again at sign and send. The workspace's networks[&lt;net&gt;].maxFeeSompi also applies; the lower one wins. No limit by default
- `--change &lt;accountOrAddress&gt;`: Change destination (account name or address); default: the sender
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated)
- `--url &lt;url&gt;`: Node wRPC URL (default: the network's rpcUrl in hardkas.config.ts; without one, ws://127.0.0.1:18210 for simnet and devnet)
- `--out &lt;path&gt;`: Save plan as artifact JSON
- `--save &lt;path&gt;`: Alias for --out (Save plan as artifact JSON)
- `--workflow-id &lt;id&gt;`: Optional deterministic workflow ID override
- `--assumption-level &lt;level&gt;`: Optional assumption level override
- `--wait-lock` (Default: `false`): No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): No effect, kept for compatibility (see --wait-lock)
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Simulator, Localnet, RPC
- **Reads:** Workspace config, Kaspa node RPC (for real-node path)
- **Writes:** TxPlanArtifact json file
- **Produces:** TxPlanArtifact
- **Accepted Identifiers:** 
- **Evidence Semantics:** Proves that a geometrically valid, fee-paying transaction was possible using available UTXOs at a specific virtualDaaScore.
- **Planner Path:** The kaspa-wasm Generator on every path: a real node (`KASPA_WASM_GENERATOR`) and the simulator (`SYNTHETIC_SIMULATOR`, over its identities).

#### Known Limitations
- A payment that needs more than one transaction is refused (`MULTI_TRANSACTION_PLAN_REQUIRED`): consolidate the UTXOs first.

#### Related
- Concept: /concepts/transactions/planning.md
- Concept: /concepts/transactions/utxos.md
- Guide: /guides/transactions/create-a-transaction.md

---

## `hardkas tx sign`

### Synopsis (Generated)

**Purpose:** Sign a transaction plan artifact stable

#### Arguments

- `&lt;planPath&gt;` (Required): 

#### Options

- `--account &lt;name&gt;`: Account name to sign with
- `--out &lt;path&gt;`: Save signed artifact JSON
- `--fixture` (Default: `false`): Sign with the built-in fixture test key (any network except mainnet)
- `--allow-mainnet-signing` (Default: `false`): Mainnet signing stays refused in this release (MAINNET_SIGNING_DISABLED); the flag has no effect
- `--threshold &lt;number&gt;`: Synthetic multisig threshold for tests (no Kaspa multisig script is produced)
- `--required-signers &lt;list&gt;`: Comma-separated signers, no spaces (with --threshold above 1)
- `--append` (Default: `false`): Append signature to a partially signed transaction
- `--target &lt;name&gt;`: Named execution target from hardkas.config.ts
- `--password-env &lt;env&gt;`: Read the encrypted account's keystore password from this environment variable
- `--password-stdin` (Default: `false`): Read the encrypted account's keystore password from stdin
- `--wait-lock` (Default: `false`): No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): No effect, kept for compatibility (see --wait-lock)
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Simulator, Localnet, RPC
- **Reads:** TxPlanArtifact, Local private keys / deterministic simulator keys
- **Writes:** SignedTxArtifact json file
- **Produces:** SignedTxArtifact
- **Accepted Identifiers:** `filepath`, `canonical artifactId`
- **⚠️ Side Effects:** Cryptographic signing operations
- **Evidence Semantics:** Proves authorization. Cryptographically asserts that the holder of the private keys approved the exact geometric bounds in the plan.

#### Related
- Concept: /concepts/transactions/signing.md
- Guide: /guides/transactions/sign-a-transaction.md

---

## `hardkas tx status`

### Synopsis (Generated)

**Purpose:** Show the derived state of a txId (SUBMITTED, MEMPOOL_ACCEPTED, ACCEPTED, CONFIRMED, FINALIZED, REORGED, …) from the workspace evidence plus one new observation, or the signature coverage of a plan/signed artifact path

#### Arguments

- `&lt;txIdOrPath&gt;` (Required): 

#### Options

- `--no-observe`: Derive from the evidence already in the workspace; take no new observation
- `-n, --network &lt;network&gt;`: Network whose configured node observes (default: the network of the recorded submission)
- `--since &lt;chainBlockHash&gt;`: Scan the node's virtual chain from this chain block (64 hex; it must precede the tx's acceptance) — for a tx sent outside this workspace
- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx send`

### Synopsis (Generated)

**Purpose:** Broadcast a signed transaction or send directly stable

#### Arguments

- `&lt;signedPath&gt;` (Optional): 

#### Options

- `--target &lt;name&gt;`: Named execution target from hardkas.config.ts (signed-artifact mode: it must match the artifact and never redirects the send)
- `--from &lt;accountOrAddress&gt;`: Sender (shortcut mode)
- `--to &lt;address&gt;`: Recipient (shortcut mode)
- `--amount &lt;kas&gt;`: Amount in KAS (shortcut mode)
- `--network &lt;name&gt;`: Network name
- `--fee-rate &lt;sompiPerMass&gt;`: Fee rate in sompi per mass (shortcut mode)
- `--password-env &lt;env&gt;`: Shortcut mode: read the sender's keystore password (an encrypted account) from this environment variable
- `--password-stdin` (Default: `false`): Shortcut mode: read the sender's keystore password (an encrypted account) from stdin
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated; signed-artifact mode only)
- `--url &lt;url&gt;`: RPC URL (optional override)
- `--yes` (Default: `false`): Confirm broadcast. Required unless the network is simulated or simnet (in shortcut mode, unless --network simulated or simnet is given): without it the send is refused (NOT EXECUTED, exit 3) and nothing is written
- `--wait-lock` (Default: `false`): No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): No effect, kept for compatibility (see --wait-lock)
- `--json` (Default: `false`): Output as JSON
- `--track &lt;label&gt;`: Signed-artifact mode: after an accepted broadcast, record a deployment with this label
- `--preflight` (Default: `false`): Payments: right before the broadcast, check every input at the node (unspent, as planned, no covenant id, not pending in its mempool) and verify each input's signature against the node's UTXO; anything it cannot verify refuses the send. One node's view, not a consensus validation
- `--allow-unplanned` (Default: `false`): Signed-artifact mode: send a signed transaction that names no plan of this workspace (signed elsewhere). HardKAS then cannot check that it is a planned transaction nor its fee limit: you take both on yourself. Without it such a send is refused (SEND_PLAN_UNRESOLVED)

### Semantic Contract (Curated)

- **Environments:** Simulator, Localnet, RPC
- **Reads:** SignedTxArtifact
- **Writes:** TxReceiptArtifact json file
- **Produces:** TxReceiptArtifact
- **Accepted Identifiers:** `filepath`, `canonical artifactId`
- **⚠️ Side Effects:** Submits transaction to network mempool or mutates local simulator state.
- **Evidence Semantics:** Proves submission acceptance by the target environment (mempool inclusion or simulator mutation). DOES NOT prove finality.

#### Known Limitations
- The printed next steps name the receipt's canonical artifactId (`hardkas explain <artifactId>`); the txId is reported as `txId` and is looked up with `--tx`.

#### Related
- Concept: /concepts/transactions/submission.md
- Guide: /guides/transactions/submit-a-transaction.md

---

## `hardkas tx receipt`

### Synopsis (Generated)

**Purpose:** Show transaction receipt stable

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx wait`

### Synopsis (Generated)

**Purpose:** Wait until the derived state of a txId reaches ACCEPTED or CONFIRMED (blue-score depth ≥ the HardKAS policy), observing the configured node, then until that node's UTXO view reflects it stable

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--until &lt;target&gt;` (Default: `confirmed`): accepted or confirmed
- `--timeout &lt;seconds&gt;` (Default: `60`): Timeout in seconds
- `--interval &lt;seconds&gt;` (Default: `2`): Seconds between observations
- `-n, --network &lt;network&gt;`: Network whose configured node observes (default: the network of the recorded submission)
- `--since &lt;chainBlockHash&gt;`: Scan the node's virtual chain from this chain block (64 hex; it must precede the tx's acceptance) on the first look — for a tx sent outside this workspace
- `--address &lt;address&gt;`: An address the tx pays (repeatable), for a tx sent outside this workspace with no --since: the scan starts at the node's sink when the wait starts, an output of the tx listed there before that point ends the wait (TX_WAIT_ACCEPTED_BEFORE_CURSOR), and the UTXO view is checked there
- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx verify`

### Synopsis (Generated)

**Purpose:** Perform deep semantic verification of a transaction plan preview

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx compare`

### Synopsis (Generated)

**Purpose:** Compare simulated vs real receipts for fidelity stable

#### Arguments

- `&lt;simulatedPath&gt;` (Required): 
- `&lt;realPath&gt;` (Required): 

---

