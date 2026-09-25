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
- `--from &lt;accountOrAddress&gt;`: Sender account name or address
- `--to &lt;address&gt;`: Recipient address
- `--amount &lt;kas&gt;`: Amount in KAS
- `--network &lt;name&gt;`: Kaspa network name
- `--fee-rate &lt;sompiPerMass&gt;`: Fee rate in sompi per mass
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated)
- `--url &lt;url&gt;`: RPC URL (optional override)
- `--out &lt;path&gt;`: Save plan as artifact JSON
- `--save &lt;path&gt;`: Alias for --out (Save plan as artifact JSON)
- `--workflow-id &lt;id&gt;`: Optional deterministic workflow ID override
- `--assumption-level &lt;level&gt;`: Optional assumption level override
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Simulator, Localnet, RPC
- **Reads:** Workspace config, Kaspa node RPC (for real-node path)
- **Writes:** TxPlanArtifact json file
- **Produces:** TxPlanArtifact
- **Accepted Identifiers:** 
- **Evidence Semantics:** Proves that a geometrically valid, fee-paying transaction was possible using available UTXOs at a specific virtualDaaScore.
- **Planner Path:** CLI Real Node uses `buildPaymentPlan` (Legacy), CLI Simulator uses `buildPaymentPlan`.

#### Known Limitations
- Candidate B (upstream unification) is not yet wired to the CLI.

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
- `--fixture` (Default: `false`): Use fixture signer for Docker testing on simnet
- `--allow-mainnet-signing` (Default: `false`): Allow signing for mainnet
- `--threshold &lt;number&gt;`: Multisig threshold
- `--required-signers &lt;list&gt;`: Comma-separated list of required signers
- `--append` (Default: `false`): Append signature to a partially signed transaction
- `--target &lt;name&gt;`: Named execution target from hardkas.config.ts
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
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

**Purpose:** Show the signature coverage and status of a transaction artifact

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx send`

### Synopsis (Generated)

**Purpose:** Broadcast a signed transaction or send directly stable

#### Arguments

- `&lt;signedPath&gt;` (Optional): 

#### Options

- `--target &lt;name&gt;`: Named execution target from hardkas.config.ts
- `--from &lt;accountOrAddress&gt;`: Sender (shortcut mode)
- `--to &lt;address&gt;`: Recipient (shortcut mode)
- `--amount &lt;kas&gt;`: Amount in KAS (shortcut mode)
- `--network &lt;name&gt;`: Network name
- `--fee-rate &lt;sompiPerMass&gt;`: Fee rate in sompi per mass (shortcut mode)
- `--provider &lt;type&gt;` (Default: `auto`): Provider mode (auto, rpc, simulated)
- `--url &lt;url&gt;`: RPC URL (optional override)
- `--yes` (Default: `false`): Confirm broadcast
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON
- `--track &lt;label&gt;`: Auto-track deployment with this label

### Semantic Contract (Curated)

- **Environments:** Simulator, Localnet, RPC
- **Reads:** SignedTxArtifact
- **Writes:** TxReceiptArtifact json file
- **Produces:** TxReceiptArtifact
- **Accepted Identifiers:** `filepath`, `canonical artifactId`
- **⚠️ Side Effects:** Submits transaction to network mempool or mutates local simulator state.
- **Evidence Semantics:** Proves submission acceptance by the target environment (mempool inclusion or simulator mutation). DOES NOT prove finality.

#### Known Limitations
- CLI-NEXTSTEPS-1: The CLI currently hints `hardkas explain <txId>` upon success, but `explain` does not accept `txId`.

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

**Purpose:** Wait for transaction to be confirmed stable

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--timeout &lt;seconds&gt;` (Default: `60`): Timeout in seconds
- `--url &lt;url&gt;`: Override RPC URL
- `-n, --network &lt;network&gt;`: Network to use
- `--address &lt;address&gt;`: Recipient address to verify UTXO maturity

---

## `hardkas tx verify`

### Synopsis (Generated)

**Purpose:** Perform deep semantic verification of a transaction plan preview

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas tx trace`

> **⚠️ DISABLED:** Tracing is temporarily disabled while the query API stabilizes.

### Synopsis (Generated)

**Purpose:** Reconstruct the full operational trace of a transaction research

#### Arguments

- `&lt;txId&gt;` (Required): 

### Semantic Contract (Curated)


#### Known Limitations

---

## `hardkas tx compare`

### Synopsis (Generated)

**Purpose:** Compare simulated vs real receipts for fidelity stable

#### Arguments

- `&lt;simulatedPath&gt;` (Required): 
- `&lt;realPath&gt;` (Required): 

---

