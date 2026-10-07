# False REORGED under accepting-block churn (2026-10-02) — evidence

The investigation and the fix of the false `REORGED` in `tx wait` / `tx status` (fix committed as
`b66eda874`, not yet published). Origin: session `21f9a2e4` scratchpad folders `cut9-reorged/` (live
investigation), `cut10-reorged-fix/` (fix, regressions, gates, live re-run) and `cut11-late/` (drafts of
the late-look test and the invariant). Preserved on 2026-10-03, on the reviewer's instruction (ledger,
BEFORE, AFTER, run 2 and run 3 classifications, independent link verification, exact parameters, gate
results; large records by hash).

## Read first

- `cut9-reorged/REORGED-DESIGN.md`: the criterion, fixed before measuring.
- `cut9-reorged/LEDGER.md`: run 1 (harness fault, kept) and run 2 (the first valid run). One false
  REORGED (tx 7): mechanisms M1 + M2 proven; 18 of 20 transactions had accepting-block churn.
- `cut10-reorged-fix/LEDGER-fix.md`: the regressions first (BEFORE on HEAD), the fix, AFTER, the hermetic
  gates (2047/0/28, then 2048/0/28 on the exact commit bytes), the live re-run, the late-look test and
  the invariant.
- `cut10-reorged-fix/report/reorged-fix.html`: the report, also at
  https://claude.ai/artifact/7FZrV5awMuyQHeTVMuj9bh

## The live runs

- Exact parameters: `cut9-reorged/reorged-record.mjs` (the harness, unchanged between run 2 and run 3),
  invoked as `reorged-record.mjs <worktree> <work> <out> 20 40 found-stopped`. Throttle 12 ms,
  `tx wait --interval 1`. `cut9-reorged/record-3.tree.txt` holds the identity of the fixed tree used by
  run 3 (whose records are in `cut10-reorged-fix/live/record-3/`).
- Classifications: `cut9-reorged/record-2.classification-v{1,2}.json`, `record-2.exposure.json`,
  `cut10-reorged-fix/record-2.follow.json`; `cut10-reorged-fix/live/record-3.classification-v2.json`,
  `record-3.exposure.json`, `record-3.follow.json`. The independent check of every link HardKAS recorded,
  asked of the node: `cut10-reorged-fix/live/record-3.verify-links.json`.
- Run 3 (with the fix): 20 of 20 CONFIRMED, 0 REORGED. The accepting block was replaced while HardKAS held
  it 8 times, and all 8 were followed; the node confirms 10 of 10 links.
- Localnet snapshots before and after: `cut10-reorged-fix/live/*.json`, `docker-ps-*.txt`.

## Gates and runs

`cut10-reorged-fix/logs/`: `fix-before-*` and `late-before-*` (BEFORE, failing as expected, kept),
`fix-after-*` and `late-after-*` (AFTER), the typecheck logs (`hk-fix-*`, `hk-fix2-*`, including the
failed first typecheck, kept) and `late-version-check.log`, each run with its vitest JSON report.

## Not copied (hash only, in `INVENTORY.tsv`)

The 52 raw per-transaction records (`record-*/tx-NN.json`, 6.3 MB). They are summarised by the
classification files above. No key material was present: the throwaway projects with their keys were
deleted after the runs.

`MANIFEST.sha256` lists the SHA-256 of every evidence file copied here; `INVENTORY.tsv` lists every file of the origin.

`.gitattributes` turns off git's end-of-line conversion here, so a checkout keeps the exact bytes that `MANIFEST.sha256` hashes.
