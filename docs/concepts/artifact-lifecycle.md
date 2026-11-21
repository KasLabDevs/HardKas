---
title: Artifact Lifecycle
description: How HardKAS records each step as a content-addressed artifact, how identity, lineage and verification work, and what the evidence proves.
---

# Artifact Lifecycle

Every meaningful step in HardKAS writes an **artifact**: a JSON file under `.hardkas/artifacts/`, identified by the
hash of its content. Artifacts are the workspace's record of what was planned, signed and sent. Everything else in
`.hardkas/` that reads them is a projection: the query store (`.hardkas/store.db`) is rebuilt from the artifacts with
`hardkas rebuild --from-artifacts`, so losing it loses no evidence.

## The lifecycle

1. **Plan** (`TxPlan`, in `plans/`). The intent: sender, recipients, amounts, the inputs the planner selected, the fee
   and the change. Planning needs no key.
2. **Signed** (`SignedTx`, in `signed/`). The plan with its signatures. It points back to its plan, and a signed
   transaction that diverges from its plan is refused.
3. **Receipt** (in `receipts/`). The simulator writes a `TxReceipt` with a synthetic `txId`. A send to a node writes a
   `TxSubmission` (`hardkas.txSubmission.v1`): the node accepted the submit request, nothing more.
4. **Observation** (`TxObservation`, in `observations/`). What one node was seen to say about a `txId`, recorded by
   `hardkas tx status` and `hardkas tx wait <txId>`. The transaction's state (`SUBMITTED`, `ACCEPTED`, `CONFIRMED`, …)
   is derived from the submission and its observations.

Replay is a check, not a stage: `hardkas replay verify <receipt>` re-runs a **simulator** receipt against the
reconstructed simulated state and compares the result. It reports determinism; it writes no artifact and proves
nothing about a network. A node send cannot be replayed (`REPLAY_MODE_UNSUPPORTED`).

<!-- qualification: artifact-identity -->

## Identity: the artifactId is the contentHash

An artifact's `artifactId` **is** its `contentHash`: a SHA-256 over the artifact's canonical serialization. The same
content gives the same id, on every operating system; editing an authenticated field gives another id.

Other identifiers live next to it, and none of them replaces it:

- **`txId`** is the Kaspa transaction id, computed from the signed transaction bytes. HardKAS does not choose it.
  `hardkas explain --tx <txId>` resolves the submission recorded for it; a bare `txId` is refused where an artifact is
  expected (`NAMESPACE_REQUIRED`).
- **`planId` and `signedId`** (`plan-<16 hex>`, `signed-<16 hex>`) are short labels derived from the hash. The
  verifier recomputes them; `hardkas explain --plan <planId>` and `--signed <signedId>` resolve them and check them
  against the hash.

To find an artifact, use `hardkas explain <artifact>`, `hardkas why <artifact>` (by artifactId or path), or
`hardkas query artifacts inspect <target>` (by path or contentHash).

## Canonical serialization

The hash is reproducible because the serialization is canonical:

- object keys are sorted;
- strings are normalized (NFC, and `\r\n` becomes `\n`), so look-alike encodings of the same text hash the same;
- big integers are tagged (`n:123`), so they never collide with the string `"123"`.

The current hash version (5) authenticates everything except a closed list of operational fields at the top level of
the artifact: timestamps such as `createdAt` and `submittedAt`, local paths, the RPC URL and host, latencies,
`hardkasVersion` and signature metadata. The self references (`contentHash`, `lineage.artifactId`) are excluded by exact
path, and the derived labels (`planId`, `signedId`) are recomputed. Every nested field is authenticated. An artifact
declares its `hashVersion`, and an older one is verified under the rules of its own version; strict verification
requires the current version (`hardkas artifact migrate <path>` re-issues a legacy artifact, never in place).

## Lineage

Artifacts point to their parents: a signed transaction to its plan, a receipt to its signed transaction. Each one
carries its `lineage` (`parentArtifactId`, `rootArtifactId` and a `sequence`), so the history of a transaction is a
chain you can walk back. `hardkas artifact lineage <path>` and `hardkas why <artifact>` show it, and `hardkas verify`
checks that it is unbroken across the workspace.

## Verification

When HardKAS loads an artifact, it does not trust the `contentHash` written in the file: it recomputes the hash from
the content and refuses a mismatch (`ARTIFACT_HASH_MISMATCH`). This catches a changed amount, recipient or signature.

- `hardkas verify` checks integrity and lineage across `.hardkas/artifacts` (or a path you give). It replays nothing.
- `hardkas artifact verify <path>` checks one artifact, offline. With `--network <network>` it also checks the
  transaction on a node of its own network (`NETWORK_OBSERVED`), and with `--require consensus` it requires a
  confirmation depth (`CONSENSUS_CONFIRMED`, by HardKAS's confirmation policy; not finality). Mainnet records are
  checked offline only.
- `hardkas artifact verify <path> --strict` adds semantic and operational checks: the current hash version, a lineage
  on every artifact, and the references below.

The hash is integrity, not authentication: it has no key, so whoever can write the workspace can write an artifact
that verifies. See the [security model](./security-model.md#artifact-integrity).

### References and policies

Artifacts can declare references: `policyRefs` (the older singular `policyRef` is still read), `networkProfileRef` and
`assumptionRef`. Under strict verification HardKAS resolves them: every referenced artifact must exist in the
workspace, its hash must match the reference, and a referenced policy (`hardkas.policy.v1`) must carry an explicit
`ALLOW` decision. A `DENY`, or a policy that cannot be resolved, fails verification.

## What the evidence proves

If you keep only the `.hardkas/` folder and come back a day later, HardKAS can still show, offline:

- that each artifact is intact (its content matches its hash);
- how the artifacts link (plan, signed, receipt or submission, observations);
- what the workspace planned, signed and submitted, under which execution target, and what each observation saw.

It cannot show, from the folder alone, that a transaction is still accepted on the network: that is a question for a
node (`hardkas artifact verify <path> --network <network>`). And evidence from the simulator is never network or
consensus evidence.

## Determinism

The same inputs give the same artifacts, byte for byte, and the same hashes on Windows, Linux and macOS. A local
success says nothing about a node, though: the simulated ledger runs no node and no Kaspa script, so confirm a
transaction on simnet before you rely on it.

## A local-first workflow

Start in the simulator (`hardkas init` makes it the default target): no Docker, no node, no faucet. Prove the
transaction logic there, then move outward: a real node on simnet (`hardkas localnet start --toccata`), then a public
testnet behind its opt-in. The artifacts look the same in every world, and each records the world it belongs to (see
[execution worlds](./execution-worlds.md)).

To bundle a test run's results and artifacts into a package that can be checked later, run `hardkas test --evidence`
and check it with `hardkas evidence verify <packagePath>` (`.hke.json`, alpha; see
[artifacts and evidence](./artifacts-and-evidence.md)).
