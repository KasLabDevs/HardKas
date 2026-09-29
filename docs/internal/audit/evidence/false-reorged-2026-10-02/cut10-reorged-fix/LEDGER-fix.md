# False REORGED · fix ledger (2026-10-02)

## GO (reviewer via the owner)

> Primero regresión determinista reproduciendo exactamente `A removed + B added/reaccepts tx` en la
> misma respuesta; debe fallar sobre HEAD. Luego corregiría el observador para calcular el estado
> después de procesar conjuntamente removidos y añadidos. Y revisaría el cursor como segundo componente
> del mismo defecto: aunque arregles la transición inmediata, no puede avanzar de forma que haga
> imposible redescubrir B. Controles: `A removed` sin reaceptación → ahí sí REORGED; mempool→confirmed
> normal; varios cambios A→B→C sin falso REORGED. Después, repetir exactamente el experimento vivo:
> 0 falsos REORGED. Y esta prueba merece quedarse permanentemente.

Standing: no commit / push / publish / changeset / bump; keep first results; owner commits.

## Where

Isolated worktree `%TEMP%\hk-fix\wt` at HEAD `0f4c2f26b` (the owner's checkout is untouched until the
end). install 83 s, full build (pskt-native from the tracked binary) 316 s.

## 1 · Regressions first (BEFORE on HEAD)

New files:
- `packages/sdk/test/reorged-acceptance-churn.test.ts` (5, end to end through `sdk.tx.observe` with a
  scripted node whose tail can be reorganised and whose answers can be bounded):
  R1 the answer that removes A shows B accepting → follows B, never REORGED, CONFIRMED later;
  R2 cursor: after A leaves, a re-accepting block the removal look did not reach is still found;
  control: A leaves, nothing re-accepts → REORGED (legitimate), back in the mempool → MEMPOOL_ACCEPTED,
  re-mined → ACCEPTED; control: mempool → accepted → confirmed; control: churn A→B→C across looks and
  two replacements between two looks → follows the tx, never REORGED.
- `packages/artifacts/test/tx-status-reacceptance.test.ts` (4): derivation with the new link; the
  unchanged two-blocks guard; a block seen final cannot be replaced; coherence of the link.

Run 1 `logs/fix-before-regression` (FIRST RESULT, kept): 41 tests (the 9 new + existing observer,
derivation and `tx status`/`tx wait` tests), 35 passed, 6 failed — exactly the expected ones: R1
`expected 'REORGED' to be 'ACCEPTED'`; R2 the looks after the removal scan from 0x…103 (the removal
look's sink) with 0 blocks, B never found; A→B→C stuck on A; derivation `CONFLICTING_OBSERVATIONS`
instead of ACCEPTED; final-then-replaced `FINALIZED` instead of CONFLICTING; coherence no throw. Both
controls and every existing test pass on HEAD.

R2 was then made deterministic (the node advances one blue score between looks, so the history order
never rests on equal-millisecond `observedAt`); re-checked against HEAD's sources
(`git restore --source=HEAD --worktree` of the 5 sources, tests kept): run `fix-before-regression2-R2-updated`
— the same 6 failures, R2 for the same reason.

## 2 · The fix (5 sources, +58 −7)

- `packages/artifacts/src/schemas.ts`: `chain_accepted` gains optional `removedAcceptingBlockHash` —
  the block this observer previously saw accepting, which the SAME answer reported off the chain.
- `packages/artifacts/src/tx-observation.ts`: coherence — the link cannot name the accepting block itself.
- `packages/artifacts/src/tx-status.ts`: within one observer's history a `chain_accepted` carrying the
  link replaces the named block (no removal recorded, nothing reorganised out); replacing a block this
  observer saw final is CONFLICTING (as removing it already was). Two accepting blocks WITHOUT the link
  stay CONFLICTING (guard unchanged).
- `packages/sdk/src/tx-observer.ts` (M1): when the previous accepting block is reported removed, the
  same answer — and the answers that continue it, within the existing `maxBatches` bound — are read for
  a chain block accepting the tx; if found, the finding is `chain_accepted(B)` + the link; only when
  none is found is the finding `chain_removed(A)` (the legitimate REORGED). `maxBatches` is now declared
  before step 1 (same default, 20).
- `packages/sdk/src/tx.ts` (M2): after `chain_removed(A)` the next look scans from A (the node answers
  from the common ancestor, so a later re-acceptance anywhere on the new chain is reachable); the
  history is ordered as `deriveTxStatus` orders it (point, then time, then id) — the old comparator
  returned 1 for equal points, so the "latest" look at an unchanged sink was arbitrary.
Residual, by design: if the removal look's bounded reads (20 answers of thousands of chain blocks)
contain no re-acceptance, `chain_removed(A)` is sealed — the tx was then unaccepted for at least that
whole span — and the cursor still finds a later re-acceptance.

## 3 · AFTER

- `logs/fix-after-targeted`: 41/41.
- `logs/fix-after-packages` (all sdk + artifacts tests): 560 tests, 555 passed, 0 failed, 5 skipped.
  (Its summary step failed: `scratchpad\wave0\gate-summary.mjs` is gone — see "temp cleaner"; the
  summary script was recreated in this folder and the run summarised from its JSON.)
- Typecheck run 1 (`%TEMP%\hk-fix\typecheck-after.log`, FIRST RESULT, kept): sdk TS2345 at
  tx-observer.ts:245 — the sdk resolves `@hardkas/artifacts` types from artifacts' dist, still the
  pre-fix build at that moment (build order, as localnet in 3c-2). Re-run after the build below.

- Typecheck run 2 after a full rebuild (exit 0, 217 s; `%TEMP%\hk-fix\typecheck-after-run2.log`): pass.

## 4 · Live re-run · preparation

- Same harness, unchanged (`cut9-reorged/reorged-record.mjs`), same arguments as run 2
  (`20 40 found-stopped`), CLI from `%TEMP%\hk-fix\wt` (sdk/artifacts dists built after the fix; the CLI
  resolves both to the worktree), HARDKAS_HOME = a fresh copy of the gate home (`hk-fix\home-live`),
  fresh work dir (`hk-fix\work3`), out `cut9-reorged/record-3` (beside `miner-before.json`). The tree's
  identity (HEAD + sha256 of the 7 files) is in `cut9-reorged/record-3.tree.txt` — the harness records
  only HEAD.
- Localnet as found: demo miner `Created` with the snapshot's exact image and arguments
  (`miner-compare.mjs`: sameImage, sameCmd), node `Exited (0)` — the state run 2 left.
- New analysis, added for the AFTER question ("si hay churn, HardKAS debe seguir la transacción"):
  `follow.mjs` — per accepting-block change the recorder saw WHILE HardKAS held the replaced block,
  did HardKAS's next look move to a later block of the truth sequence without a removal; plus every
  link HardKAS recorded checked against the truth sequence, and HardKAS vs truth at HardKAS's last look.
  Checked on run 2 (BEFORE, `record-2.follow.json`): replacedWhileHeld 1, followed 0, removals recorded
  1 (tx 7), last look agrees with truth 19/20 — the known result.
- Read-through of the fix for the "consulted much later" variant (A held; B replaced A and is already
  final at the next look): the removal look finds B and seals `finality_reached(B)` (no link — only
  `chain_accepted` carries it); the derivation returns FINALIZED(B) because a finality finding is
  decided before the two-blocks guard. Before the fix the same case sealed `chain_removed(A)` → REORGED.
  Derivation half checked by `diag-finality-variant.mjs` against the worktree's built dists
  (`logs/diag-finality-variant.log`): [chain_accepted(A), finality_reached(B)] → FINALIZED(B);
  [chain_accepted(A), chain_removed(A)] → REORGED. The observer half is the existing `acceptedBy`
  (finality_reached when confirmationsBlue ≥ 432 000 on simnet), now reached from the removal branch.
  Not pinned by a repo test (outside the GO's list); can be added if wanted.

## 5 · Full hermetic gate on the fixed tree

`logs/fix-after-gate1` (worktree, the 7 files; `.snap` EOL restored before and after): 913 files,
2075 tests, **2047 passed, 0 failed, 28 skipped** = baseline 2038/0/28 at 0f4c2f26b + the 9 new tests.
Non-loopback attempts 0; PASS; 871 s. Loopback targets: 18210 ×5 (baseline ×3), 19999 ×1, 7420 ×2,
8545 ×9 — the extra two 18210 attempts are not attributed (no trace run); while this gate ran, a node
was up on 18210 from 21:56:54 to 22:02:51 (below), so tests that probe the localnet port met a live
node for six minutes.

## 6 · The localnet changed during the gate (not by this session)

Docker events 21:56:53–22:02:51: the canonical node container (2a3285b7, bound to merchant-pos-demo's
data) destroyed and a new one created (577648be, not bound to the demo's data: its kaspad dir is
unchanged since 18:40); the demo miner (52087733, Created) destroyed; three miners created, run ~16 s
or ~1 min and killed; at 22:02:49–51 the new node killed and destroyed. Left: no node container, miner
7538e24b Exited (1) with another session's arguments (`-a kaspasim:qp6wmr… --throttle 5`).
Concurrent: another session's full gate in the owner's checkout (`gate-hermetic.mjs --home
%TEMP%\claude\audit-compare\run\home-wasm --deny-ports 16210,17210,18210`, started 21:56:48, the first
destroy came 5 s later), plus a Codex computer-use runtime started 21:53:58. This gate's test files at
each event time (`files-at.mjs`) are unrelated to Docker (pskt-cli, json-contract, query-store-security,
replay-divergence, private-key-deprecation, run-command…; none of the 11 mentions docker, kaspad or
localnet start/fund/node reset), and of the earlier gates' before/after snapshots only one differs
(3c2-after-gate1: the miner replaced, while the owner's demo was in use). Not investigated further (another session's work). Docker quiet from 22:02:52.

Owner's decision (asked): "Cadena nueva" — when the other gate ends, create the node from scratch in a
throwaway project, run the same script, and at the end remove that node and leave the miner as found;
do not touch the demo.

## 7 · Live re-run (record-3)

- 22:38 other gate finished; Docker quiet since 22:02:52; CPU 17 % (the owner's Chrome).
- As found (`live/miner-before.json`, `live/docker-ps-before.txt`): no node container; miner 7538e24b
  Exited (1), `-a kaspasim:qp6wmr… -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1 --throttle 5`.
- Node created: `hardkas init node-proj` + `hardkas localnet start --toccata` (the worktree's CLI) in
  `%TEMP%\hk-fix\node-proj` → container bf94bdd890e6, data `hk-fix\node-proj\.hardkas\kaspad`, a fresh
  simnet chain (run 2 ran on the demo's chain at blue score ~82 k; the churn mechanism does not depend
  on height). The node start does not touch the miner.
- Harness unchanged, same arguments as run 2: `reorged-record.mjs <wt> hk-fix\work3 live\record-3 20 40
  found-stopped`. `found-stopped` makes its end state "miner re-created from `live/miner-before.json`,
  not started; node stopped"; its opening log line ("was stopped: started it for the run") is therefore
  inexact here — the node had just been created by this session. Afterwards this session removes the
  node it created (bf94bdd890e6) and `hk-fix\node-proj`.

### Result (`live/record-3/`, the first and only AFTER run; nothing re-run)

- 20/20 transfers sent and measured in 7.1 min (fund 34 s), 0 harness errors; fresh throwaway accounts
  (sender `kaspasim:qzhve0…`, recipient `kaspasim:qqqv7u…`). Every `tx wait` exit 0; HardKAS's last state
  CONFIRMED 20/20.
- `classify.mjs` (v2, unchanged; `record-3.classification-v2.json`): 19/20 with accepting-block churn;
  0 lost acceptance; **0 REORGED claims → 0 FALSE_REORGED**, 0 TRUE_REORGED; 20/20 finally accepted with
  the output at the recipient; 20 mempool exits before acceptance (normal), none gave REORGED.
- `exposure.mjs` (`record-3.exposure.json`): **replacedWhileHeld 8** (run 2: 1) — the node replaced a
  block HardKAS held, while HardKAS was still looking, in txs 1, 2, 8, 10, 12, 16, 18, 19; removals
  recorded by HardKAS 0.
- `follow.mjs` (`record-3.follow.json`): **8/8 followed** — each time HardKAS's next look sealed
  `chain_accepted(new block)` with `removedAcceptingBlockHash` = the replaced block, the new block later
  than the replaced one in the recorder's sequence; often the recorder saw an intermediate block that
  HardKAS stepped over in one look (A→B→C, e.g. tx 1, 8, 12, 19). 10 links recorded, 10/10 name the
  block HardKAS then held; at HardKAS's last look it held the recorder's block in 20/20.
  Two links (tx 4 `12e50e41→f835b651`, tx 6 `d5c2d318→f407665b`) name a replaced block the recorder never
  sampled (1 211 samples, gap median 266 ms, p90 281 ms, max 561 ms: those blocks were the accepting
  chain block for less than one sampling gap).
- `verify-links.mjs` (`record-3.verify-links.json`; the node restarted briefly after the run, kaspa-wasm
  RpcClient only): for all 10 links the node knows the replaced block, it is not a chain block, the node
  itself lists it as removed from the selected chain, and the chain block that accepts the tx now is
  exactly the one HardKAS recorded — 10/10, including the two blocks the recorder had not sampled.
- Each of the 10 link observations made exactly one `getVirtualChainFromBlock` call (its evidence):
  the re-acceptance was in the very answer that reported the removal (M1's case); HardKAS's next look
  came 0.65–1.21 s after the recorder saw the replacement.
- Criterion (fixed before the run): 0 false REORGED — met; churn while held followed — 8/8.

### Cleanup and end state

- The harness ended with the miner re-created from `live/miner-before.json` (5c1f4fa51750, Created,
  same image and arguments as the 7538e24b found — sameImage/sameCmd) and the node stopped; the node was
  started once more for `verify-links.mjs` and stopped; then this session removed it (id checked =
  bf94bdd890e6). End state (`live/docker-ps-final.txt`): no node container, miner not running with the
  found configuration, `hardkas-real-node` untouched. The demo's data was never touched.
- Removed with safe-rm-quiet: `hk-fix\node-proj` (59 files), `hk-fix\work3` (219 files, the throwaway
  keys), `hk-fix\home-live`, the worktree `hk-fix\wt` (6 630 links unlinked, 0 outside the tree; then
  `git worktree prune` — the other session's worktree `.claude/worktrees/inspiring-jones-bb14af` kept),
  and the rest of `hk-fix` (its logs copied to `logs/hk-fix-*`; `fix-src` = byte copies of the final
  sources).

## 8 · Into the owner's checkout (no commit)

The owner's checkout at 0f4c2f26b was clean (nothing running in it). The 7 files copied from the
verified worktree: byte-identical (sha256) and blob-identical (`git hash-object`) — schemas.ts 076fe61c,
tx-observation.ts fa4ff7af, tx-status.ts b0e6b4b1, tx-observer.ts 6bf73712, tx.ts f37a25d7,
tx-status-reacceptance.test.ts 98ecd31b, reorged-acceptance-churn.test.ts 267d28c5. Status: exactly
5 M (+58 −7) and 2 ??. Not run there: its dists are pre-fix, and the sdk tests/typecheck resolve
`@hardkas/artifacts` from its dist (build order, as typecheck run 1) — a build comes first.

## 9 · After the report: the late-look test + the invariant (reviewer, relayed by the owner)

> Hay además un test que añadiría antes del commit … consulta tardía cuando B ya es final →
> `FINALIZED`, nunca `REORGED`. … Después de eso, yo haría el commit propietario de estos 7 ficheros +
> ese test si se añade, verificando que no entra nada más. No mezclaría aquí la prueba live permanente,
> evidence packaging, release notes ni cambios de demo. … La semántica … merece quedar como invariante
> de HardKAS: La sustitución del accepting block no constituye por sí misma la retirada de una
> transacción. `REORGED` exige evidencia de pérdida de aceptación, no simplemente pérdida del bloque
> aceptante previamente observado. … Y dejaría `recoverReorged` de la demo por ahora. … añadir test
> tardío → commit limpio del fix → archivar evidencia → después incorporar el live qualification test →
> release note → publicación → quitar workaround de la demo.

- The test goes into the existing `packages/sdk/test/reorged-acceptance-churn.test.ts` (the commit stays
  7 files). Through `sdk.tx.observe` the network is the submission's, "simulated" in the SDK test
  harness, which has no finality depth; so it drives `observeTxOnce` directly on simnet (as
  `wave2-a-tx-observer.test.ts` does), passing `previousAcceptingBlockHash: A` exactly as
  `sdk.tx.observe` does when the history derives ACCEPTED(A), and derives with `deriveTxStatus` over a
  simnet submission. ChurnNode gains `recorder()` (the five observer reads, with evidence).
- The invariant goes into `packages/artifacts/src/tx-status.ts`'s header (comment only), next to
  "accepted → removed ⇒ REORGED", which it qualifies.
- Drafts: `cut11-late/` (copies of the owner's two files, blob-checked before editing).
- Fresh isolated worktree `%TEMP%\hk-fix2\wt` at 0f4c2f26b, HEAD build first (as round 1): install 73 s,
  build 259 s, tree clean after the showcase restore.
- BEFORE (`logs/late-before-regression`, FIRST RESULT, kept): the two test files on HEAD's sources, same
  5-file set as round 1 → 42 tests, 35 passed, **7 failed** = round 1's 6 (R1, R2, A→B→C, and 3 of the 4
  derivation tests) + the new late test: `expected { type: 'chain_removed', … } to match object
  { type: 'finality_reached', … }` — HEAD's removal branch seals the removal although B accepts and is
  final (which the history derives REORGED).
- AFTER (`logs/late-after-targeted`): the 5 fixed sources (tx-status.ts now with the invariant comment;
  the other 4 byte-copied from the owner's checkout) → **42/42**, PASS. Sources diff +65 −7 (tx-status.ts
  +19, of which 7 are the invariant comment).
- Full rebuild with the fix (180 s), typecheck artifacts+sdk scope: pass (`logs/hk-fix2-typecheck-after.log`).
- Full hermetic gate on the exact commit bytes (`logs/late-after-gate1`): 2076 tests, **2048 passed,
  0 failed, 28 skipped** (= 2047 + the late test), 0 non-loopback attempts, PASS, 969 s. Loopback
  targets 18210 ×3, 19999 ×1, 7420 ×2, 8545 ×9 — the same as the 0f4c2f26b baseline: round 1's 18210 ×5
  matches the six minutes another session kept a node up on 18210 during that gate.
- `version:check` on the final tree: pass (literals equal the root version 0.12.0-rc.26, as the
  existing fixtures do; `logs/late-version-check.log`).
- Into the owner's checkout (still clean of anything else, the 5 earlier blobs unchanged since the
  copy): tx-status.ts and the churn test replaced. All 7 byte- and blob-identical to the verified tree:
  schemas.ts 076fe61c, tx-observation.ts fa4ff7af, **tx-status.ts ef9dad8c**, tx-observer.ts 6bf73712,
  tx.ts f37a25d7, tx-status-reacceptance.test.ts 98ecd31b, **reorged-acceptance-churn.test.ts
  1421f013**. Status: exactly 5 M (+65 −7) and 2 ??. No commit.
- Worktree removed (safe-rm-quiet: 6 630 links, 0 outside), `git worktree prune` (the other session's
  worktree kept), `%TEMP%\hk-fix2` removed; its logs kept as `logs/hk-fix2-*`.

Next, in the reviewer's order (none of it in the fix commit): the owner's clean commit of these 7 →
evidence package in the persistent audit tree → live qualification test (`tests/localnet/…`, optional,
outside the hermetic gate) → release note → publish → remove the demo's `recoverReorged` once it
consumes the published fix.

## Finding · the temp cleaner removes old scratchpad evidence

The session scratchpad lives in %TEMP%. `wave0/`, `wave0-evidence/`, `wave0-evidence.zip`, `hh-wasm/`,
`hh-wasm-b2/` (all 25-sep) are gone; folders from 26-sep on are still there (incl. the 3b gap record
in `cut6-events/`). Consistent with an age-based temp cleanup (~7 days), and with the earlier
disappearances (tarball extractions and pnpm node_modules carry 1985 mtimes). The minimum evidence
should move out of %TEMP% (owner's choice of place).
