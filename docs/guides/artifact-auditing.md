---
title: Artifact Auditing
description: Inspect, verify, explain and trace the lineage of the artifacts HardKAS writes, offline and without replay.
---

# Artifact Auditing

Every HardKAS command that plans, signs or sends writes an artifact: a JSON record whose `contentHash` is the
SHA-256 of its canonical payload. An artifact's `artifactId` **is** its `contentHash`: the same content gives the same
id, and an edited file no longer hashes to the id it carries.

The workspace store keeps them under `.hardkas/artifacts/`: plans in `plans/` (`txPlan-<id>.json`), signed
transactions in `signed/` (`signedTx-<id>.json`), and in `receipts/` the simulator's `TxReceipt` and a node send's
`TxSubmission`. The examples below also write their own copies with `--out`:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out plan.json
hardkas tx sign plan.json --account alice --out signed.json
```

## 1. Inspect an artifact

```bash
hardkas artifact inspect plan.json
```

Prints the artifact's fields in a readable form (it takes a path or an artifact id). Read a plan this way before you
sign it.

## 2. Verify integrity and lineage

```bash
hardkas verify
hardkas artifact verify plan.json --strict
```

- `hardkas verify` checks the whole workspace (`.hardkas/artifacts/`, recursively and in strict mode), or one file or
  directory inside the workspace given as `hardkas verify <path>`.
- `hardkas artifact verify <path>` checks one artifact (or a directory with `--recursive`).

Both validate each artifact against its schema, recompute its `contentHash` and compare it with the one it carries
(`ARTIFACT_HASH_MISMATCH` when they differ), and check that its lineage links (`parentArtifactId`, `rootArtifactId`)
are unbroken. They contact no node and **replay nothing**: the `artifact verify` report always shows
`REPLAY UNSUPPORTED`. To re-execute a simulator run, use `hardkas replay verify <receipt>`
([Replay Verification](./replay-verification.md)).

`artifact verify` can also check an artifact above integrity, on request:

| Level | How | What it means |
| :--- | :--- | :--- |
| integrity (default) | offline, every network | the file is what was written |
| network | `--network <network>` (the artifact's own), optional `--url <url>` | a node of that network observed the transaction (`NETWORK_OBSERVED`) |
| consensus | `--require consensus` | the transaction is `CONSENSUS_CONFIRMED` at the blue-score depth of `--min-confirmations` (default 100); this is not finality |

```bash
hardkas artifact verify <simnet-submission.json> --network simnet --require consensus
```

A mainnet artifact is verified offline only: mainnet is never contacted. With `--json`, a failed verdict exits 1 with
`VERIFICATION_FAILED`, and a verdict below the `--require` level with `VERIFICATION_LEVEL_NOT_REACHED`. The levels are
explained in [Receipts and verification levels](../start/receipts-and-levels.md).

## 3. Explain an artifact

```bash
hardkas explain <artifactId>
hardkas explain --tx <txId>
```

`hardkas explain` prints a narrative of one artifact: what it is, and the chain of artifacts that led to it. Name the
artifact by its exact 64-hex `artifactId` or by its path in the workspace, or by a namespace:

- `--tx <txId>`: the submission receipt of that transaction (never the signed transaction); when the workspace holds
  no submission for it, the transaction as this workspace observed it (`origin: observed`).
- `--plan <planId>` and `--signed <signedId>`: a plan or a signed transaction by its derived label, verified against
  its hash.
- `--workflow <workflowId>`: a workflow run.

A bare 64-hex value is read as an `artifactId`, so give a transaction with `--tx`. A label or a simulator txId without
its namespace is refused with `NAMESPACE_REQUIRED`, and the message names the option to use.

`hardkas artifact explain <path>` gives a shorter operational summary of one artifact file.

## 4. Why: the lineage of an artifact

```bash
hardkas why <artifactId>
hardkas why --tx <txId> --json
hardkas artifact lineage signed.json
```

`hardkas why` resolves its input like `explain` and prints only the causal chain: it follows the `parentArtifactId`
references back to the root of the flow (the plan) and shows every step that produced the artifact. `--json` prints
the lineage graph. `hardkas artifact lineage <path>` shows the provenance of one artifact file.

Lineage proves where an artifact came from: a signed transaction traced back, hash by hash, to the plan that authorized
it. It re-executes nothing; that is replay. The indexed version of the same graph is
`hardkas query lineage chain <anchor>` ([Query Store](./query-store.md)).

<!-- qualification: artifacts -->
