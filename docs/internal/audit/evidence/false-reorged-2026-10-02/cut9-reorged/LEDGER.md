# False REORGED · record ledger (2026-10-02)

GO (reviewer via the owner): use the localnet now; throwaway accounts distinct from the demo's; keep
the first complete run even if it contradicts the hypothesis (later runs diagnostic only); the
independent node observer is the only classification authority; per tx keep txId, DAA, mempool,
accepting block and its changes, UTXO outputs, HardKAS's full state sequence; do not stop at
REORGED; no change to tx-observer.ts or the cursor before the result.

Setup: CLI built from HEAD 0f4c2f26b in an isolated worktree (`%TEMP%\hk-reorg\wt`, packages only,
pskt-native from the tracked binary); HARDKAS_HOME = a copy of the gate home; demo miner snapshotted
(`miner-before.json`: `-a kaspasim:qqk76…9f2xkg … --throttle 12`). The localnet was found STOPPED
(node exited 0 ~8 min before; miner exited 1); the run started the node.

## Run 1 · `record-1/` — complete, KEPT, harness fault (measures nothing about the hypothesis)

- 12 transfers in 40 min (cap). All 12 `tx send --json` succeeded: the workspace holds 12
  `hardkas.txSubmission.v1` (mode localnet, ws://127.0.0.1:18210).
- Every tx was then waited for and recorded under the WRONG id: `findTxId` searched the send JSON
  depth-first for any `txId`/`transactionId` and returned the plan's first input outpoint (the funding
  coinbase transaction). Proven: 12/12 recorded ids are plan input outpoints, 0/12 are submissions;
  two transfers spending the same coinbase got the same "id" (tx 6 = tx 10).
- Consequently HardKAS answered INSUFFICIENT_EVIDENCE for all 12 (no submission for those ids) and the
  recorder never saw "them" accepted after the submit-time sink nor as outputs at the recipient.
  915 observations were written for the wrong ids.
- Second fault: the demo-miner restore failed — PowerShell 5.1 wrote the `docker inspect` snapshot as
  UTF-16+BOM, JSON.parse refused it. The node and the miner (on a burner address) stayed up.
Fixes for run 2: the txId is the receipt's or the signed tx's own id, confirmed against the
txSubmission.v1 the send wrote; the snapshot reader decodes UTF-16/BOM; the end state is forced to
"found stopped" (miner container re-created, not started — starting it would mine to the demo's
address — and the node stopped).

## Run 2 · `record-2/` — the first run that measures the submitted transactions

- Fresh project and throwaway accounts (sender `kaspasim:qrffpc…`, recipient `kaspasim:qq5xyp…`);
  `localnet fund` with `HARDKAS_TOCCATA_MINER_THROTTLE_MS=12`, then the miner (throttle 12) on a burner
  address. 20/20 transfers sent and measured in 12.7 min, 0 errors. Every txId confirmed against its
  txSubmission.v1. End state as found: miner container re-created with the demo's exact image and
  arguments (status Created, not started), node stopped (Exited 0).
- Classification (`classify.mjs`, criterion fixed in REORGED-DESIGN.md; recorder = authority):
  `record-2.classification-v2.json`. v1 kept: its "tx wait exit" state took the first state word of
  the timeout message ("…to be CONFIRMED; last derived state: REORGED") and so marked tx 7 as recovered;
  v2 reads "last derived state". Summary (v2):
  - 20 sent; 20/20 finally accepted with their output at the recipient; 0 ever lost acceptance.
  - 18/20 had accepting-block churn (1–3 changes of accepting chain block, A → B, never A → none).
  - 1 transaction with REORGED claims (tx 7): FALSE_REORGED, M1 and M2 both proven; 0 TRUE_REORGED.
  - HardKAS never recovered (REORGED through the 150 s wait and 8 later `tx status` looks).
  - 19 mempool exits before a chain block accepted the tx (the normal inclusion → acceptance window):
    none produced REORGED (H2 is not a cause). No incomplete-query symptom (H3): every look after the
    removal scanned and answered not_found from a cursor past the re-accepting block.
- tx 7 (`fb696772…5b69d09`), the sequence:
  - 244.5 s SUBMITTED · 245.9 s ACCEPTED by A = `dbe9bbba…` · 247.1 s REORGED (HardKAS's look at
    18:43:58.448Z sealed `chain_removed(A)`).
  - The node, asked the same `getVirtualChainFromBlock(A)` when the recorder saw the change: removed =
    [A], added = 1 block, B = `fbdd76bd…`, which accepts the tx (M1: the re-acceptance was in the very
    answer that reported the removal).
  - Then 110 HardKAS looks, all `not_found`, every one scanning from a cursor with blue score 82 778 →
    84 580, above B's 82 754 (M2: the cursor was past B from the first look; B could never be found).
  - Recorder at every REORGED claim (8 claims): accepted by B on the current chain, output present.
- Exposure (`exposure.mjs`, `record-2.exposure.json`): in 17 of the 18 churned transactions every
  change happened BEFORE HardKAS's first acceptance look, so HardKAS only ever held the final block and
  reached CONFIRMED. tx 7 is the only one whose accepting block changed AFTER HardKAS held it
  (replacedWhileHeld = 1): 1 of 1 such cases gave a false REORGED. The rate depends on timing (look
  cadence vs churn), which fits the demo's ~1/3 vs 1/20 here.
- Side note: the final accepting blocks mostly start with high hex digits (e…/f…): with equal blue
  work the chain prefers the larger hash, so the selected chain keeps moving to later siblings while
  blocks race — the churn mechanism of a fast-mined simnet.

Conclusion: block-acceptance churn, not a transaction reorg. HardKAS's REORGED was false in every
case it was emitted; the cause is M1 + M2 as hypothesised. No code changed.

Cleanup: `%TEMP%\hk-reorg` removed with safe-rm-quiet (6 630 junctions unlinked, none outside the
tree, 93 071 files), worktree pruned, repo clean. The record (47 files, 5.4 MB) stays here.
