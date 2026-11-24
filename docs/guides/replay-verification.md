---
title: Replay Verification
description: Re-execute a simulator run from its receipt with replay verify, and what replay does not cover.
---

# Replay Verification

Replay re-executes a recorded simulator run and checks that it produces what was recorded. It covers the HardKAS
simulator only: a transaction sent to a Kaspa node cannot be replayed by HardKAS, because the history of a live node
cannot be rebuilt from local artifacts. Validating a node transaction belongs to the node's consensus.

## Replay one receipt

A send on the simulator writes a `TxReceipt` under `.hardkas/artifacts/receipts/`:

```bash
hardkas tx send --from alice --to bob --amount 10 --network simulated
hardkas replay verify <receipt>
```

`replay verify` takes **one** simulator receipt: its exact `artifactId`, or its path in the workspace, such as
`.hardkas/artifacts/receipts/txReceipt-<id>.json`. The receipt is required, and a directory is refused
(`ARTIFACT_INPUT_IS_DIRECTORY`). Add `--json` for a machine-readable verdict.

What it does, in order:

1. Resolves the receipt's lineage in the store (the plan, the signed transaction, the receipt) and checks the
   integrity of each. An input that does not pass is not executed and leaves no report (`REPLAY_INPUT_INVALID`).
2. Refuses what is not a simulator run, before anything runs: a node send records a `TxSubmission`, not a `TxReceipt`,
   and a plan made for a node was never run by the simulator (`REPLAY_MODE_UNSUPPORTED`). A receipt with a legacy hash
   version is refused too (`REPLAY_LEGACY_AUTH_SCOPE`): re-issue it with `hardkas artifact migrate <path> --to 5`.
3. Rebuilds the simulator state (`.hardkas/localnet.json`) as it stood just before the receipt's DAA score, applies the
   plan, and compares the result with the receipt. The verdict has three parts: `lineage`, `determinism` and
   `contamination` (a simulator identity found inside an artifact of a real network).
4. Writes a replay report (`<time>-<txId>.replay.json`) under `.hardkas/artifacts/`.

A pass exits 0. A different outcome is `REPLAY_DIVERGED` (exit 1). From the SDK, `sdk.replay.verify(<receipt id or
path>)` returns the same verdict as `passed`, `lineage`, `determinism`, `contamination` and, when it declined to run,
`code`.

## What replay is not

- **A node send.** On simnet or testnet-10, `replay verify` answers `REPLAY_MODE_UNSUPPORTED` and executes nothing.
  Check a node transaction with `hardkas tx status <txId>`, `hardkas verify <path>` on its submission, and
  `hardkas artifact verify <path> --network <network> --require consensus`
  ([Artifact Auditing](./artifact-auditing.md#2-verify-integrity-and-lineage)).
- **Lineage.** `hardkas artifact lineage signed.json` follows the `parentArtifactId` pointers and checks the hash at
  every step: it proves that a signed transaction came from its plan, but re-executes nothing.
- **Artifact verification.** `hardkas verify` and `hardkas artifact verify` check integrity and lineage; they never
  replay.
- **Static receipt checks.** `hardkas query replay divergences` and `hardkas query replay invariants <txId>` read the
  stored receipts' fields (hashes, state hashes, UTXO counts, fees); nothing is re-executed.

`hardkas replay diff <idA> <idB>` (alpha) compares two replay artifacts.

<!-- qualification: replay -->
