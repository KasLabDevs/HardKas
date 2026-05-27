# HardKAS Local Runtime Contracts

HardKAS is a local-first development environment. To ensure that tooling built on top of HardKAS can safely parse and analyze the workspace, we expose a subset of our internal artifacts and report structures as **public semantic contracts**.

> [!WARNING]
> HardKAS is a local-first development environment. These contracts apply *strictly to the local environment* (local-only scope). Mainnet compatibility, ZK bridging, and L1 verification logic are out of scope and explicitly volatile/unstable.

## Frozen Contracts

The following schemas have been partially frozen. They will not experience backward-breaking changes, field renames, or type mutations in the current version. 

### 1. The Core Artifact Schema
**Schema Version:** `hardkas.artifact.v1`

Applies to: `hardkas.txPlan`, `hardkas.signedTx`, `hardkas.workflow.v1`, and `hardkas.snapshot`.

**Frozen Fields:**
- `schema`: Identifies the specific artifact type.
- `schemaVersion`: Optional on older artifacts, defaults to `hardkas.artifact.v1` going forward.
- `hardkasVersion`: The version of the SDK that generated the artifact.
- `contentHash`: The canonical SHA-256 hash.
- `createdAt`: ISO-8601 timestamp.
- `networkId`: e.g. `kaspa-testnet-10` or `kaspa-simnet`.
- `mode`: e.g. `simulated`.

**Compatibility Rules:**
- New fields may be added as optional.
- Older artifacts missing `schemaVersion` must still parse and verify.

### 2. The Transaction Receipt Shape
**Schema Version:** `hardkas.receipt.v1`

Applies exclusively to `hardkas.txReceipt`.

**Frozen Fields:**
- `schema`: `hardkas.txReceipt`.
- `schemaVersion`: `hardkas.receipt.v1`.
- `txId`: The Kaspa transaction ID.
- `status`: One of `pending`, `submitted`, `accepted`, `confirmed`, `failed`.
- `from`, `to`, `amountSompi`, `feeSompi`.

### 3. Dev Doctor Output
**Schema Version:** `hardkas.devDoctor.v1`

The `--json` output of `hardkas dev doctor` is frozen to allow CI integration.

**Frozen Fields:**
- `schemaVersion`: `hardkas.devDoctor.v1`
- `status`: `ready | warning | failed`
- `checks`: Array of check objects containing `name`, `status`, `message`, and optionally `code` and `suggestion`.

### 4. Torture Matrix Report
**Schema Version:** `hardkas.tortureReport.v1`

The `--json` output of `hardkas torture matrix` (and the saved `.hardkas/reports/torture-{seed}.json`).

**Frozen Fields:**
- `schemaVersion`: `hardkas.tortureReport.v1`
- `seed`: The global PRNG seed used.
- `iterations`: Total number of cases executed.
- `profile`: The profile executed (e.g., `local`, `corruption`), or `null` if unfiltered.
- `summary`: Bucket breakdown and pass/fail counts.

**Volatile/Optional Fields:**
- `cases`: Array of individual case executions.

### 5. Artifact Inspect
**Schema Version:** `hardkas.artifactInspect.v1`

The `--json` output of `hardkas artifact inspect`.

**Frozen Fields:**
- `schemaVersion`: `hardkas.artifactInspect.v1`
- `status`: Output status (e.g., `success`, `ARTIFACT_NOT_FOUND`, `ARTIFACT_AMBIGUOUS`)
- `artifact`: The basic parsed artifact data.
- `path`: The absolute path where it was found.

### 6. Replay Verify
**Schema Version:** `hardkas.replayVerify.v1`

The `--json` output of `hardkas replay verify`.

**Frozen Fields:**
- `schemaVersion`: `hardkas.replayVerify.v1`
- `result`: One of `passed`, `diverged`, `unsupported`, `missing_dependency`, `non_deterministic`.
- `targetTxId`: The transaction ID being replayed.
- `deterministic`: Boolean indicating if replay matches perfectly.

## Unstable Surfaces

The following areas are explicitly **unstable** and subject to breaking changes:
- `scriptCapabilities` and `scriptMetadata` (all covenant/smart-contract related fields).
- Any Igra / L2 integration schemas.
- The internal SQLite projection schema (`store.db`).
- The in-memory Dashboard API.
