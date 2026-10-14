# CLI-CONTRACT-2 · ledger (2026-10-10)

Isolated worktree `%TEMP%\hk-ra\wt`, detached at develop **`3c61d15f6`** (WORKSPACE-AUTHORITY-2 published; tree
`1136a842`). The owner's checkout, the demo's localnet and every published evidence folder untouched. No commit, push,
version or full gate. The full account is `INVESTIGATION.md` (§0–§13 the investigation and the BEFORE; §14 Phase A);
this ledger is the index of its decisions, runs and trees.

## 1 · The finding (TEST-VACUOUS-PASS, the last orange of the 6-oct mini re-audit, and its family)

`hardkas test --json` answered `ok:true` with no test run; around it, commands that claimed what they had not done
(`dev tx send` "Transaction submitted." with nothing sent), inputs given empty and replaced by a default (`tx plan
--amount ""` → 1 KAS), one unreachable node under three codes, usage errors without an envelope, errors with exit 0.
INVESTIGATION §9 separates the live defects (all of the 6-oct residue but two) from the historical ones already fixed.

## 2 · Decisions (reviewer, 2026-10-10)

| Round | Decision |
| --- | --- |
| Investigation + BEFORE | accepted provisionally: 28 cases (24 red / 4 green), 328 hermetic sweep runs, on `3c61d15f6` |
| Phase A · TRUTHFULNESS | `hardkas test`: verdict from the runner's own results, zero collected / all skipped / failures / executed passes distinguished, one JSON document with counts and the right exit, the useful human output kept, existing code conventions checked. `dev tx send`: no claim of submission and no exit 0 without a send; not an intentional stub, so a typed `TX_SEND_NOT_EXECUTED` until its consent is decided; no broadcast wired. `tx plan`: explicit empty `--from` / `--to` / `--amount` refused before any plan; omitted options keep their documented defaults |
| Not authorized in Phase A | the commander JSON overhaul, the `UNKNOWN` cleanup, `status` / `doctor` / `ci verify`, the idempotent re-send, the placeholder tests |

## 3 · Invariants (Phase A)

- **CC2A-I1** a `hardkas test` pass proves something ran: `ok:true` only with executed tests and no failure; zero
  collected (`NO_TESTS_FOUND`), zero executed (`NO_TESTS_EXECUTED`) and any failure (`TESTS_FAILED`) are typed, in
  the one JSON document, with exit 1; the counts come from the runner's own task tree and its report is kept on disk.
- **CC2A-I2** `dev tx send` says "submitted" only after a send step that ran and produced a receipt; a usage error is
  exit 2 and a flow that did not broadcast is a typed exit 1.
- **CC2A-I3** an explicitly empty value is never a default: `tx plan` refuses it (`TX_PLAN_USAGE`, exit 2) before the
  config loads; omitted options keep alice / bob / 1 KAS.

## 4 · Files

Product: `packages/cli/src/runners/test-runner.ts`, `packages/cli/src/runners/dev-tx-runners.ts`,
`packages/cli/src/commands/tx.ts`. Tests: `packages/cli/test/cli-contract-2a.test.ts` (AFTER, 17),
`packages/cli/test/cli-contract-2.test.ts` (BEFORE, 28: A3 adapted to the decided contract, 14 cases labelled
`[known gap: … -> CLI-CONTRACT-2B]`). Evidence: this folder (`before/`, `after/`).

## 5 · Runs (every run kept)

| Stage | Run | Result |
| --- | --- | --- |
| BEFORE | `cc2-before-1` · `test-2` · `sweep-2` | 28: 4 green / 24 red · the orange 8 verbatim · 328 runs, the 6-oct residue number for number (§1 of the investigation) |
| build | `build-cc2a-1` | 24 / 24, 24 / 24 |
| AFTER | `cc2a-after-1` | AFTER 17 / 17; the unchanged BEFORE file 13 green / 15 red (from 4 / 24) |
| related | `cc2a-related-1` | 53 CLI files: 373 tests, 365 green / 0 red / 8 skipped (labelled known gaps), PASS, 647 s |
| final | `cc2a-after-2` | 45 tests: 31 green / 0 red / 14 skipped (the labelled Phase B cases): AFTER 17 / 17, BEFORE 14 / 14 active, PASS, 48 s |
| FULL-GATE-1 · contracts again | `cc2a-after-3` | 45: 31 green / 0 red / 14 skipped, PASS, 62 s |
| FULL-GATE-1 · build + typecheck | `build-cc2a-full-1` · `build-cc2a-full-2` | typecheck 54 / 54; product build 44 / 44 — the two app builds (`@hardkas/docs`, `@hardkas/dashboard`) fail on files missing from the worktree's `node_modules/.pnpm` (environment, INVESTIGATION §14.7), not on the product |
| FULL-GATE-1 · the gate | `cc2a-gate-1` · `cc2a-parity-1` · `cc2a-gate-2` | gate 1: 2946: 2902 green / 0 red / 42 skipped + 2 pending, vitest exit 1 on one unhandled "Worker exited unexpectedly" (the `sdk-parity-0-9-1` file unfinished) — kept, classified as a nondeterministic worker death (INVESTIGATION §14.7); that file alone 2 / 2; **gate 2: PASS, 2946: 2904 green / 0 red / 42 skipped (28 + 14), no unhandled error, 1422 s**; 0 non-loopback in all three |

0 non-loopback attempts in every run; `C:\.hardkas` never existed.

## 6 · Registered, not fixed here (Phase B)

INVESTIGATION §14.5: the `UNKNOWN` family; `UI.error` as a failure; `create --json`; `status`; `ci verify`; `doctor`'s
exit; the idempotent re-send label; commander's usage errors; the logger line in `run`; `kaspa doctor`'s two
documents; the abrupt `process.exit()` sites; the corpus placeholders; the test report's `--network`; `dev tx send`'s
consent (DEV-TX-SEND-NETWORK-1).

## 7 · Trees and manifest

- **Code tree** (this evidence folder excluded): **`3e57caf618e5462ea308b00700e4f6e24427a81e`** over HEAD `3c61d15f6`
  (tree `1136a8425751c4f0ed60e731088fcd7ffcb9e6e5`); 5 paths (3 modified, 2 added), +762 / −26; code patch
  `cli-contract-2a-code.patch` sha256 `aa1d320d64e842dcae38eeb2211746ba090a09e2617fc0a9ddbfff7a0b877f60`. Computed
  with a temporary index (`manifest-cc2.ps1 -Mode code`, kept in `after/scripts`), the native binary restored first.
- **Full tree** (code + this folder): computed by `manifest-cc2.ps1 -Mode final` once this ledger is frozen — it writes
  `MANIFEST.sha256` (one sha256 per file of this folder, itself excepted) and then the tree the owner's commit must
  reproduce. That hash cannot be written here without changing itself, so it travels with the handover
  (`manifest-final-f2/tree.txt`, the full patch `cli-contract-2a.patch` and its sha256, `MANIFEST.blobs` with one git
  blob id per changed path) and is verified against the published commit, as in every wave. f1 (`d58cd526…`, 52
  paths) was the evidence tree frozen before FULL-GATE-1; f2 adds the gate runs of INVESTIGATION §14.7; the code tree
  is `3e57caf6…` in both.
- Integration as in every wave, on the reviewer's GO: `git apply --binary` of the full patch onto the owner's working
  tree (no `--index`), `git add -A`, the owner's commit; the commit's tree must equal the full tree, and the changed
  paths must match `MANIFEST.blobs` and `MANIFEST.sha256` path by path.
