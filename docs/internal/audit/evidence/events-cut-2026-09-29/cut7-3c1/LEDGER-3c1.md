# Surface Cut 3c-1 · ledger (2026-10-02)

## Order (reviewer, relayed by the owner)

> Retoma exactamente en 3c-1. No reabras 3a ni 3b. Conserva `createUtxoContext`. Primero escribe la
> regresión BEFORE que demuestre que `resilient-subscriber` y `WalletSubscriptionManager` siguen
> publicados pese a no tener consumidores; después elimina únicamente esas dos superficies, prueba
> tarballs npm/pnpm externos y ejecuta el gate completo. STOP y entrega revisión antes de empezar
> 3c-2. No tocar `KaspaRpcClient.subscribeTo*`, `on/off`, `LoadBalancedRpcProvider`,
> `Hardkas.open()` ni `packages/cli/out/` en 3c-1.

Standing rules: no commit / push / publish / changeset / version bump; keep every first result;
packed-consumer rule (real tarballs, npm + strict pnpm, empty HARDKAS_HOME, before vs after).

## Environment

- Base: `a1e774f6e` (= origin/develop; the 3b qualified tree, gate 2040/0/28).
- 11:40:47 the owner's checkout showed 4 tracked files deleted (`pnpm-lock.yaml`,
  `packages/core/src/index.ts`, the pskt-native `.node`, `labs/02-merchant-checkout/package.json`)
  and the two untracked lab files gone; the conversation-start snapshot had them modified. At
  11:45:55 the checkout was clean again (the files restored at 11:40:54). Not mine; untouched.
- Because another actor works in that checkout, 3c-1 is built, packed and gated in an isolated
  worktree: `%TEMP%\hk-3c1\wt` (detached at `a1e774f6e`, `git worktree add`; the owner's index is
  not touched). The final change set is copied into the owner's checkout at the end and compared
  byte for byte with the qualified worktree files.
- Worktree build: `pnpm -r --filter "!@hardkas/pskt-native" --workspace-concurrency=1 run build`.
  turbo cannot skip the native package (`--filter=!` still schedules `@hardkas/pskt-native#build`
  through `^build`, dry-run 61/61), and compiling it means building rusty-kaspa's wallet crates
  from scratch; the tracked HEAD `.node` is used instead (the same bytes the usual
  "build + restore the tracked .node" leaves).
- `pnpm install --frozen-lockfile`: exit 0, 117 s (warnings: `hardkas` bin links not created
  because the CLI dist did not exist yet — the same as any fresh clone).
- BEFORE build: exit 0, 323 s (`%TEMP%\hk-3c1\build-before.log`). It rewrote 33 tracked
  compiled files under `labs/showcase-suite/apps/*/src` (known; pack-gate.ps1 restores them too);
  restored with `git -C wt checkout -- labs/showcase-suite`. Worktree = HEAD + the 2 new tests.

## 1 · Regression first (BEFORE = HEAD + the new tests only)

New files:
- `packages/kaspa-rpc/test/surface-cut-resilient-subscriber.test.ts` (4 tests)
- `packages/toolkit/test/surface-cut-subscription-manager.test.ts` (3 tests)

Same scanning pattern as the existing guard `packages/tx-builder/test/compat-shim-consumers.test.ts`
(roots packages/examples/labs/apps/scripts, code files, build outputs skipped; `target` added to
the skip set so a Rust build dir is not walked).

Run `logs/3c1-before-regression` (targeted: the 2 new files + the surfaces' own tests + the gate
resolver test) — FIRST RESULT, kept: 18 tests, 13 passed, 5 failed, exit 1. The 5 failures are
exactly "still published":
- kaspa-rpc exports `[ './internal/*' ]`;
- kaspa-rpc build = `tsup src/index.ts src/adapters/index.ts src/internal/resilient-subscriber.ts …`;
- kaspa-rpc mentions = `src/internal/resilient-subscriber.ts`, `test/resilient-subscriber.test.ts`,
  `packages/testing/test/gate-subpath-exports.test.ts` (the class, its tests, the resolver sample);
- toolkit: `"WalletSubscriptionManager" in toolkit` → `true`;
- toolkit mentions = `src/subscriptions.ts`, `test/wallet-watch.test.ts` (the module and its tests).
Passed, i.e. "no consumers": both "no code outside its own files uses it" checks; and the
surfaces' own tests (2 + 3) and the resolver test (6) pass on HEAD.

Full gate on the same BEFORE tree, `logs/3c1-before-gate1` (first run, kept): 2075 tests, 2042
passed, 5 failed, 28 skipped, 629 s, 0 non-loopback attempts. The 5 failures are the five
"still published" assertions above and nothing else; 2042 = the 2040 of the qualified
`a1e774f6e` gate + the 2 "no consumers" checks. The isolated worktree reproduces the baseline.

## Finding before the cut · toolkit's build never cleans `dist`

- `@hardkas/toolkit` builds with plain `tsc` (so do jobs, query-store, simulator-adapters; every
  other package uses `tsup --clean`). `tsc` never deletes outputs of deleted sources, and
  `files: ["dist"]` packs whatever is there.
- Already visible in the owner's checkout: `packages/toolkit/dist/silver/{index,templates,types}.*`
  (12 files) survive although `packages/toolkit/src/silver/` was deleted in the Silver cut (29-sep).
- npm: `latest = rc = 0.12.0-rc.25`; rc.26 is not published. rc.24 and rc.25 toolkit tarballs have
  98 files, consistent with a clean build of their own trees (Silver still existed then), so no
  stale file has shipped yet. The next publish from that checkout would carry `dist/silver/*`, and
  after 3c-1 also `dist/subscriptions.*`.
- No `incremental`/tsbuildinfo for toolkit (tsconfig.base has none), so "delete dist, then tsc"
  re-emits everything.

## 2 · BEFORE packed set

`packed-smoke.mjs <wt> %TEMP%\hk-3c1 before all` from the BEFORE build (HEAD dist; the two
untracked regression tests are not in any `files` list): 32 tarballs, no `workspace:` leak,
176 s. Consumers, each with an empty HARDKAS_HOME:
- npm: install 0, 24 @hardkas installed (0 from a registry), 145 third-party, imports 30 ok +
  the 2 known `@hardkas/testing/{setup,scenarios}` failures (vitest is an optional peer), the 7 CLI
  steps OK (version, capabilities, init with the real kaspa-wasm download, accounts, tx plan,
  artifact verify, query), plan schema `hardkas.txPlan`.
- strict pnpm: install 0, 32 installed (0 from a registry), 150 third-party, imports 38 ok + the
  same 2, the 7 steps OK.
Surface probe inside both consumers (`probe-before-{npm,pnpm}.json`, identical):
- `@hardkas/kaspa-rpc/internal/resilient-subscriber` RESOLVES, exports `ResilientSubscriptionClient`;
  kaspa-rpc export keys `[".", "./adapters", "./internal/*"]`; `dist/internal` = the `.js` + `.d.ts`.
- toolkit: `"WalletSubscriptionManager" in toolkit` → true; `dist/subscriptions.{js,d.ts,maps}`;
  `dist/subscriptions.d.ts` declares all three names.
- unchanged-by-design checks: `watch()` without a node → `WALLET_WATCH_REQUIRES_NODE`;
  `createUtxoContext` is a function; `subscribeToUtxosChanged`, `subscribeToVirtualChainChanged`,
  `on`, `off` present on `JsonWrpcKaspaClient` and `MockKaspaRpcClient`.

Side note: the BEFORE gate rewrote the tracked snapshot
`packages/artifacts/test/adversarial/__snapshots__/wave1-1-canonical-v5.test.ts.snap` with LF
endings (11:57:39, during the gate); `git diff` is empty (content identical, autocrlf warning only).
Pre-existing environment effect of running vitest on a CRLF checkout, not 3c-1. Restored in the
worktree with `git checkout --`.

## 3 · The cut (AFTER-1 = exactly the two surfaces)

Deleted (Remove-Item, not blocked):
- `packages/kaspa-rpc/src/internal/resilient-subscriber.ts` (265 lines)
- `packages/kaspa-rpc/test/resilient-subscriber.test.ts` (2 tests)
- `packages/toolkit/src/subscriptions.ts` (108 lines: the class and its two types)
- `packages/toolkit/test/wallet-watch.test.ts` (3 tests)
Edited:
- `packages/kaspa-rpc/package.json`: `./internal/*` export removed; build entry
  `src/internal/resilient-subscriber.ts` removed (`src/internal/storage-mass.ts` stays: it is
  bundled into `index.js`, never was its own entry).
- `packages/toolkit/src/index.ts`: `export * from './subscriptions.js'` removed.
- `packages/testing/test/gate-subpath-exports.test.ts`: the assertion that resolved
  `@hardkas/kaspa-rpc/internal/resilient-subscriber` removed. No replacement on a real package:
  the only other wildcard export is `@hardkas/query`'s `"./*": "./dist/*.js"`, which ships only
  `dist/index.js` (a phantom pattern; separate observation). Wildcard resolution stays covered by
  the synthetic `"./internal/*"` case of the same test and by the accounts `internal/` subpath.
`git diff --stat`: 7 files, +1 −622. Not touched: `KaspaRpcClient.subscribeTo*`, `on/off`,
`LoadBalancedRpcProvider`, `Hardkas.open()`, `packages/cli/out/`, `createUtxoContext`, 3a/3b code,
`PUBLIC_API_SURFACE.md` (regenerated by the release flow; it still lists rpc-events too).

### AFTER-1 results (first AFTER result, kept)

- Build over the existing BEFORE dist (the owner's real flow: a checkout that has built before),
  exit 0, 181 s; the 33 showcase outputs restored again.
- kaspa-rpc dist (tsup --clean): `index.{js,d.ts}`, `adapters/index.{js,d.ts}` only.
- toolkit dist (tsc): `subscriptions.{js,d.ts,maps}` STILL THERE, dated 11:53:41 (BEFORE build),
  next to the new `index.js` (12:11:04).
- Targeted run `logs/3c1-after1-targeted`: 51/51 (the 7 regression tests, gate resolver 6, 3b's
  13 + 6, 3a's 2, toolkit 8, kaspa-rpc subscriptions 9). Packages run `logs/3c1-after1-packages`
  (all kaspa-rpc + toolkit tests + the resolver test): 135/135.
- Tarballs (`tarball-diff-after1.json`): 32/32 packages, 20 byte-identical. kaspa-rpc: −
  `dist/internal/resilient-subscriber.{js,d.ts}`, − `dist/chunk-IXYYBT7R.js` (the chunk tsup
  shared between the two entries; now inside `index.js`), ~ `dist/index.js`, ~ `package.json`.
  toolkit: 90 → 90 files, ~ `dist/index.{js,d.ts}` + maps, ~ `package.json`, and
  `dist/subscriptions.{js,d.ts,maps}` still packed — the only files of the AFTER set that mention a
  removed name. The other 10 changed `package.json` are the same content in a different key order
  (`pnpm pack` writes resolved workspace deps in varying order; checked canonically,
  `pkgjson-canon.cjs`); kaspa-rpc's differs only in `exports` and `scripts.build`.
- Consumers: identical to BEFORE on every compared field (`compare-consumers-after1.json`):
  installs, @hardkas sets, third-party sets, 0 from a registry, imports 30+2 / 38+2, the 7 CLI
  steps with no output difference after normalising, plan.json identical. Only manifest delta:
  kaspa-rpc `exports`.
- Probe (`probe-after1-{npm,pnpm}.json`, identical): resilient subpath →
  `ERR_PACKAGE_PATH_NOT_EXPORTED`; kaspa-rpc keys `[".", "./adapters"]`, no `dist/internal`, no
  mention; `"WalletSubscriptionManager" in toolkit` → false; BUT the installed toolkit still holds
  `dist/subscriptions.*` with all three names in its `.d.ts`. Unchanged-by-design checks identical.

Classification: real defect of the release flow, pre-existing (toolkit builds with plain `tsc`),
exposed by 3c-1. The public API is gone (not importable through `exports`), the bytes are not.

### AFTER-2 = AFTER-1 + toolkit's build cleans `dist`

`packages/toolkit/package.json`: `"build": "tsc"` →
`"build": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc"`.
Dependency-free and valid in cmd.exe (pnpm's script shell on Windows here: no `shell-emulator`, no
`script-shell`) and in sh. Side effect, same package: the stale `dist/silver/*` of the owner's
checkout disappear from the next toolkit tarball as well. In the owner's checkout the other plain
`tsc` packages (jobs, query-store, simulator-adapters) have no stale module today; left alone.

AFTER-2 build, again over the existing (stale) dist: exit 0, 168 s; pnpm ran
`node -e "require('node:fs').rmSync('dist',{recursive:true,force:true})" && tsc` through cmd.exe;
`subscriptions.*` present before, gone after; toolkit dist 88 → 84 files. Showcase outputs restored.

Tarballs (`tarball-diff-after2.json`, BEFORE vs AFTER-2): 32/32 packages, 19 byte-identical, 11 only
`package.json` key order (accounts, artifacts, bridge-local, cli, dev-server, localnet, query, sdk,
sync-daemon, testing, wallet-adapter — canonical content identical). Real changes, exactly:
- kaspa-rpc 9 → 6 files: − `dist/internal/resilient-subscriber.{js,d.ts}`, − `dist/chunk-IXYYBT7R.js`;
  ~ `dist/index.js` (1 199 B importing a 65 405 B chunk → 65 404 B self-contained; `index.d.ts`
  byte-identical); ~ `package.json` (`exports` without `./internal/*`, `scripts.build`).
- toolkit 90 → 86 files: − `dist/subscriptions.{js,d.ts,js.map,d.ts.map}`; ~ `dist/index.{js,d.ts}`
  + maps (the `export * from './subscriptions.js'` line; in `index.js` the Silver comment above it
  goes too, because tsc emitted it as that statement's leading comment and the next statement is a
  type-only export); ~ `package.json` (`scripts.build` only).
- 0 files in the whole AFTER-2 set mention any of the five removed names.

Consumers (`after2`, 113 s): npm install 0, 24 installed / 0 from a registry / 145 third-party,
imports 30 + the 2 known, 7/7 steps; strict pnpm install 0, 32 / 0 / 150, imports 38 + 2, 7/7.
`compare-consumers-after2.json` vs BEFORE: only manifest delta kaspa-rpc `exports`; installs,
@hardkas and third-party sets, imports, the 7 steps (no output difference) and plan.json identical
in both consumers.
Probe (`probe-after2-{npm,pnpm}.json`, identical): resilient subpath →
`ERR_PACKAGE_PATH_NOT_EXPORTED`; kaspa-rpc keys `[".", "./adapters"]`; no `dist/internal`; 0
mentions in kaspa-rpc; `"WalletSubscriptionManager" in toolkit` → false; no
`dist/subscriptions*`; 0 mentions in toolkit. Unchanged by design: `watch()` without a node →
`WALLET_WATCH_REQUIRES_NODE`; `createUtxoContext` a function; `subscribeToUtxosChanged`,
`subscribeToVirtualChainChanged`, `on`, `off` on `JsonWrpcKaspaClient` and `MockKaspaRpcClient`.

## 4 · Full gate on the final tree (AFTER-2)

`logs/3c1-after2-gate1` (first run, kept): 2070 tests, 2042 passed, 0 failed, 28 skipped, 610 s,
PASS, 0 non-loopback attempts, loopback targets identical to BEFORE (18210 ×5, 19999 ×1, 7420 ×2,
8545 ×9). Tree = `a1e774f6e` + exactly the 10 changes (`.status` file). Arithmetic: BEFORE 2075 −
5 deleted tests (2 resilient, 3 wallet-watch) = 2070; the 5 failing regression assertions now
pass → 2042 = 2040 (3b qualified) + 7 new − 5 deleted. The snapshot EOL rewrite happened again and
was restored in the worktree.

## 5 · Transfer to the owner's checkout

- 12:5x: owner's checkout at `a1e774f6e`, `git status` clean; the 8 target files equal HEAD's
  blobs; the 2 new files absent.
- Deleted the 4 files (Remove-Item, not blocked); copied the 6 files from the worktree; SHA-256
  equal for all 6.
- `git status`: exactly the 8 tracked changes + the 2 untracked regression tests;
  `git diff --stat` 8 files, +2 −623. `git hash-object` of the 6 files = the qualified blob ids
  (`%TEMP%\hk-3c1\qualified-blobs.txt`):
  - 987ed06f1f7a… packages/kaspa-rpc/package.json
  - ebefca016d01… packages/toolkit/package.json
  - 047919a77305… packages/toolkit/src/index.ts
  - 0c735398bad4… packages/testing/test/gate-subpath-exports.test.ts
  - 43e0b291055c… packages/kaspa-rpc/test/surface-cut-resilient-subscriber.test.ts (new)
  - 70c6b2ff13f8… packages/toolkit/test/surface-cut-subscription-manager.test.ts (new)
- Not done (owner): commit (must include the 2 new test files), push, publish, release notes
  (removed from what rc.25 published: `@hardkas/kaspa-rpc/internal/resilient-subscriber` and the
  toolkit's `WalletSubscriptionManager`, `WalletWatchHandler`, `WalletSubscriptionEvent`).
- The owner's `packages/toolkit/dist` still holds `silver/*` and `subscriptions.*`; the next
  `pnpm build` with the new build script removes them before compiling.
- Worktree `%TEMP%\hk-3c1\wt` (detached, registered with `git worktree add`) kept until the commit
  is verified; remove with `git worktree remove --force` afterwards.

## Observations, out of 3c-1 (not acted on)

- `@hardkas/query` exports `"./*": "./dist/*.js"` but its tsup build emits only `dist/index.js`:
  every `@hardkas/query/<x>` except `index` is a phantom subpath for npm consumers, while the
  gate's workspace resolver maps it to `src/<x>.ts` and would resolve it.
- jobs, query-store, simulator-adapters also build with plain `tsc` (no stale module today).
- Running the gate on a CRLF checkout rewrites one tracked `.snap` with LF (content identical).
