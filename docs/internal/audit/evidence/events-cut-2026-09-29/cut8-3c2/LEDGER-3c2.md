# Surface Cut 3c-2 · ledger (2026-10-02)

## Order (reviewer, relayed by the owner)

> Que primero escriba regresiones que fallen sobre HEAD; después elimine exclusivamente
> `subscribeTo*`, `on`, `off` y sus tipos/implementaciones; construya desde `dist` limpio; empaquete
> los 32 tarballs; instale consumidores npm y pnpm estrictos; compruebe que ninguna otra superficie
> cambia; y finalmente pase el gate hermético.
> Conservar: WalletToolkit.watch(), createUtxoContext(), UtxoContext, Hardkas.open(), RPC
> request/response, LoadBalancedRpcProvider (por ahora), tx wait/status polling.
> No mezclar: `@hardkas/query` `./*`, `LoadBalancedRpcProvider`, `packages/cli/out/`. Después del gate,
> parar y revisar. Tratarlo como surface cut y documentarlo como breaking change de la RC.

Standing rules: no commit / push / publish / changeset / version bump; keep every first result;
packed-consumer rule.

## Base

- 13:16 the owner's checkout: HEAD `a1e774f6e` = origin/develop, working tree = exactly the
  qualified 3c-1 change (8 tracked + 2 new tests), not committed yet.
- So 3c-2 is built on the qualified 3c-1 tree, in the same isolated worktree `%TEMP%\hk-3c1\wt`
  (a1e774f6e + 3c-1). "BEFORE on HEAD" = this tree, i.e. what HEAD becomes when the owner commits
  3c-1 as qualified. 3c-2 touches no 3c-1 file, so the two can be committed separately.

## Inventory (read-only, on the base)

The API: in `packages/kaspa-rpc/src/index.ts` the `KaspaRpcClient` members
`subscribeToUtxosChanged`, `subscribeToVirtualChainChanged`, `on`, `off`, and the exported types
`UtxosChangedEvent`, `RpcAcceptedTransactionIds`, `VirtualChainChangedEvent`, `KaspaSubscription`.

Implementations (5 left after 3c-1):
- `JsonWrpcKaspaClient` (kaspa-rpc index.ts): real ones. Fields `subscriptionCounter`,
  `rawListeners`, `subscriptions`, `utxoAddressRefs`, `virtualChain`; private `track`/`untrack`;
  the constructor's `session.onConnect(...)` that re-attaches listeners and re-issues
  `subscribeUtxosChanged`/`subscribeVirtualChainChanged` on a new connection; module-private
  `OFFICIAL_EVENTS` and `ActiveListener`.
- `KaspaJsonRpcClient` (json-rpc-client.ts): `on`/`off` no-ops, `subscribeTo*` throw
  `RPC_SUBSCRIPTIONS_UNSUPPORTED` (a plain Error string, not in errors.ts).
- `LoadBalancedRpcProvider` (provider.ts): `on` → primary, `off` → all, `subscribeTo*` wrap the
  first successful client. Delegations to `KaspaRpcClient` members, so they cannot outlive the
  interface members. The class itself stays (only these 4 members go).
- `MockKaspaRpcClient` (kaspa-rpc index.ts): no-op `on`/`off`, fake subscriptions.
- `LocalnetSimulatedProvider` (localnet provider.ts): no-op `on`/`off`, fake subscriptions.
Internal, only for the API: `OfficialRpcSession.onConnect` + `connectHooks` (session.ts; the class
is not exported from the package entry — only `officialRpcFactory`, `toWrpcUrl` and two types are).
After the cut, `index.ts` no longer needs `toWire`/`utxoReferenceToWire` (both stay in wire.ts:
`toWire` is the session's result conversion and calls `utxoReferenceToWire`).

Callers: none in production. No code passes a node notification name to `.on(`/`.off(`. Tests:
`packages/kaspa-rpc/test/subscriptions.test.ts` (9, all on this API; the reconnect path of
request/response stays covered by `upstream.test.ts`). 3b's
`packages/toolkit/test/wallet-watch-utxocontext.test.ts` uses fake objects with a
`subscribeToUtxosChanged` spy to prove `watch()` never subscribes — left untouched. No public doc
mentions the API (only the release-generated `PUBLIC_API_SURFACE.md` and docs/internal).

Not in scope, seen: `KaspaWrpcClient.onNotification` (wrpc-client.ts, a separate exported class used
for request/response by plugin-rpc-backend, dev-server health, CLI rpc doctor and tx send): a
notification hook with 0 consumers. Not `KaspaRpcClient`; untouched.

Public reach: `@hardkas/kaspa-rpc` main entry (the interface, the 5 classes, the 4 types) and
`hk.rpc` in the SDK (`public readonly rpc: KaspaRpcClient`). Published in rc.25 → breaking for any
external user of `subscribeTo*`/`on`/`off`/the types; release-note text to be handed to the owner.

## 1 · Regression first (BEFORE = base + the new tests only)

New files:
- `packages/kaspa-rpc/test/surface-cut-subscriptions.test.ts` (4): prototypes of the 4 kaspa-rpc
  classes have none of `subscribeToUtxosChanged`/`subscribeToVirtualChainChanged`/`on`/`off`;
  `OfficialRpcSession.prototype` has no `onConnect`; no code outside the API's own files names it
  (or passes a node notification name to `.on(`/`.off(`); stays deleted. Exceptions documented in
  the file: the two regression files and 3b's watch test (its fake has a `subscribeToUtxosChanged`
  spy).
- `packages/localnet/test/surface-cut-subscriptions.test.ts` (1): `LocalnetSimulatedProvider`'s
  prototype has none of the 4.

Run 1 `logs/3c2-before-regression` (FIRST RESULT, kept): 53 tests, 47 passed, 6 failed. 4 are the
expected "still published" failures; 2 were NOT expected: the 3c-1 guard
`surface-cut-subscription-manager.test.ts` failed "no consumers" and "stays deleted" because my new
3c-2 test's header comment named `WalletSubscriptionManager`. Classification: my authoring fault in
the new test; the 3c-1 guard was right. Fix: the comment says "the toolkit's subscription manager".
Run 2 `logs/3c2-before-regression2`: 53 tests, 49 passed, 4 failed, exactly the expected ones:
- the 4 kaspa-rpc classes each have `[subscribeToUtxosChanged, subscribeToVirtualChainChanged, on, off]`;
- `"onConnect" in OfficialRpcSession.prototype` → true;
- stays deleted → `kaspa-rpc/src/{index,json-rpc-client,provider}.ts`, `kaspa-rpc/test/subscriptions.test.ts`,
  `localnet/src/provider.ts` (the API's own files only);
- localnet: the provider has the 4.
Passed: "no code outside the API's own files uses it" (no consumers), subscriptions.test.ts 9/9,
upstream.test.ts (session), 3b watch tests, both 3c-1 guards.

## 2 · BEFORE packed set (`%TEMP%\hk-3c2\before`)

Packed from the base worktree (its dist = the 3c-1 AFTER-2 build of this same tree): 32, no leak,
178 s. Cross-check vs the 3c-1 `after2` tarballs: 19 byte-identical, 13 only `package.json` key
order — the same packed set. Consumers: npm 0 / 24 / 0 from registry / 145 / imports 30+2 / 7/7;
strict pnpm 0 / 32 / 0 / 150 / 38+2 / 7/7.
Probe `probe-before-{npm,pnpm}.json` (identical): each of JsonWrpcKaspaClient, KaspaJsonRpcClient,
LoadBalancedRpcProvider, MockKaspaRpcClient, LocalnetSimulatedProvider has the 4 removed members and
the 10 checked request/response members; removed names appear in kaspa-rpc `dist/index.{js,d.ts}`
and localnet `dist/index.{js,d.ts}`, none in sdk or cli; Mock and LoadBalanced(2 mocks) `getInfo()`
answer; a closed port → `RpcConnectionError`; `Hardkas.open()` in an empty dir → network
`simulated`, rpc `LocalnetSimulatedProvider`, `getInfo()` answers; `watch()` without a node →
`WALLET_WATCH_REQUIRES_NODE`; `createUtxoContext` a function; `KaspaWrpcClient` exported.

## 3 · The cut

- `kaspa-rpc/src/index.ts`: the 4 types; the 4 interface members; `OFFICIAL_EVENTS`,
  `ActiveListener`; in `JsonWrpcKaspaClient` the 5 fields, the constructor's `session.onConnect`
  block, `on`, `off`, `track`, `untrack`, `subscribeToUtxosChanged`, `subscribeToVirtualChainChanged`;
  in `MockKaspaRpcClient` `on`, `off` and the 2 fakes; the now unused `toWire`/`utxoReferenceToWire`
  import (both stay in wire.ts, used by the session).
- `kaspa-rpc/src/upstream/session.ts`: `connectHooks`, `onConnect()`, the hook loop in `open()`.
- `kaspa-rpc/src/provider.ts` (LoadBalancedRpcProvider): `on`, `off`, the 2 `subscribeTo*`, the
  2 type imports, and the private `primary` getter whose only use was `on()`. Nothing else in the class.
- `kaspa-rpc/src/json-rpc-client.ts` (KaspaJsonRpcClient): `on`, `off`, the 2 throwing
  `subscribeTo*`, the 3 type imports.
- `localnet/src/provider.ts` (LocalnetSimulatedProvider): `on`, `off`, the 2 fakes, the 3 type imports.
- Deleted `kaspa-rpc/test/subscriptions.test.ts` (9 tests).
3c-2 alone (`git diff --stat` on its paths): 6 files (5 edited, 1 deleted), 0 insertions, 508
deletions — index.ts −227, json-rpc-client.ts −19, provider.ts −45, session.ts −7,
subscriptions.test.ts −186, localnet provider.ts −24 — plus the 2 new test files. No 3c-1 file touched.

Typecheck run 1 `typecheck-after-run1.log` (FIRST RESULT, kept, before any rebuild): kaspa-rpc
`tsc --noEmit` PASS; localnet FAIL TS2420 "LocalnetSimulatedProvider ... missing
subscribeToUtxosChanged, subscribeToVirtualChainChanged, on, off". Classification: build order —
localnet resolves `@hardkas/kaspa-rpc` types through kaspa-rpc's `dist/index.d.ts`, still the
pre-cut build at that moment. Not a code fault; re-run after the build.

## 4 · AFTER builds: the owner's flow and a clean dist

- Incremental build (over the base dist, as `pnpm build` in a checkout that has built before):
  exit 0, 215 s. kaspa-rpc dist: `index.js` 65 404 → 57 240 B, `index.d.ts` 24 820 → 21 814 B.
  Typecheck run 2 (`typecheck-after-run2.log`): kaspa-rpc PASS, localnet PASS. Showcase outputs
  restored (33). Packed as `after-incremental` (pack only): 32, no leak.
- Clean dist, as the reviewer asked: `git ls-files packages/*/dist` = 0 tracked files; the 33
  `packages/*/dist` dirs (350 files, no reparse point) removed, then the same full build →
  `after` (pack + both consumers). Build exit 0, 213 s; pack + consumers 121 s; 32, no leak.
- `after-incremental` vs `after` (`tarball-diff-incremental-vs-clean.json`): 21 byte-identical, 11
  only `package.json` key order → the owner's normal build and a clean-dist build ship the same files.

## 5 · What users receive, BEFORE vs AFTER (clean dist)

Tarballs (`tarball-diff-before-vs-after.json`): 32/32, 19 byte-identical, 11 only `package.json` key
order (accounts, bridge-local, cli, dev-server, sdk, simulator, storage-postgres, sync-daemon,
testing, toolkit, wallet-adapter). Real changes, exactly:
- kaspa-rpc 6 → 6 files: ~ `dist/index.js`, ~ `dist/index.d.ts` (its `package.json` byte-identical).
- localnet 10 → 10 files: ~ `dist/index.js`, ~ `dist/index.d.ts` (+ package.json key order).
- 0 files of the AFTER set mention any removed name (`subscribeTo*`, the 4 types, `OFFICIAL_EVENTS`,
  `RPC_SUBSCRIPTIONS_UNSUPPORTED`, the node's `subscribeUtxosChanged`/`subscribeVirtualChainChanged`).
- kaspa-rpc's public export list: 64 → 60 names; removed exactly `KaspaSubscription`,
  `RpcAcceptedTransactionIds`, `UtxosChangedEvent`, `VirtualChainChangedEvent`; added none. The d.ts
  diff only removes the 4 interface members, the 4 types, and the matching class members (plus
  `JsonWrpcKaspaClient`'s private fields/methods and `LoadBalancedRpcProvider`'s private `primary`).
  localnet's d.ts: the import loses the 3 types; the provider loses the 4 members.
Consumers (`compare-consumers.json`): 0 manifest differences (dependencies, exports, bin); npm and
strict pnpm identical on installs, @hardkas and third-party sets, imports 30+2 / 38+2, the 7 CLI steps
(no output difference) and plan.json.
Probe (`probe-after-{npm,pnpm}.json`, identical; `probe-diff.cjs` vs BEFORE): only `classes`
(removed members 4 → 0 on all 5 classes; the 10 kept members identical), `mentions` (→ none) and
`sdk.rpcRemoved` (4 → 0) differ. Identical: Mock and LoadBalanced `getInfo()`, the closed-port
`RpcConnectionError`, `KaspaWrpcClient`, `Hardkas.open()` (simulated, LocalnetSimulatedProvider,
getInfo), `watch()` → `WALLET_WATCH_REQUIRES_NODE`, `createUtxoContext`.
Harness faults on the way (kept, not product): `probe-diff` run 1 choked on the UTF-8 BOM PowerShell
5.1 writes with `1>`; run 2 lost its `﻿` escape in the tool call; fixed as a file
(`cut8-3c2/probe-diff.cjs`). An inline `Remove-Item Env:HARDKAS_HOME` was refused by the shell guard
(read as a path); nothing ran, re-issued with `$env:HARDKAS_HOME = $null`.

## 6 · Tests on the AFTER tree

- `logs/3c2-after-targeted`: 52/52 (both 3c-2 regressions, session/upstream, 3b watch + reconnect,
  both 3c-1 guards, 3a's guard).
- `logs/3c2-after-packages` (all of kaspa-rpc, localnet, toolkit, sdk): 398 tests, 393 passed, 0
  failed, 5 skipped.
- Qualified blob ids (`%TEMP%\hk-3c2\qualified-blobs-3c2.txt`): index.ts 7bd8b18e…,
  json-rpc-client.ts f4954325…, provider.ts c2c3bbac…, session.ts b099232b…, localnet provider.ts
  48f77035…, kaspa-rpc surface-cut-subscriptions.test.ts 142e473f…, localnet
  surface-cut-subscriptions.test.ts e5b3a05e…; `kaspa-rpc/test/subscriptions.test.ts` deleted. The 6
  3c-1 files still hash to their qualified blobs.

## 7 · Full gate on the final tree

`logs/3c2-after-gate1` (first run, kept): 2066 tests, 2038 passed, 0 failed, 28 skipped, 756 s,
PASS, 0 non-loopback attempts. Tree = a1e774f6e + 3c-1 + 3c-2 (`.status`). Arithmetic: 2070 (3c-1
final) − 9 (subscriptions.test.ts) + 5 (the 2 regressions) = 2066; 2042 − 9 + 5 = 2038.

Loopback summary differs from every earlier gate in one line: `127.0.0.1:18210 x3` (25 earlier gate
logs show x5, one old one — gate-phase1-1 — x3). Investigation (diagnostic only, nothing changed):
- With `HARDKAS_HERMETIC_TRACE=1` the 3 attempts are kaspa-wasm `RpcClient` WebSockets (ws 8.21.2)
  from 2 test processes; the trace depth does not reach the HardKAS caller.
- A subset (dev-server, sdk, localnet, kaspa-rpc, config tests, artifacts wave10, cli rpc-commands)
  gives x3 on the final tree in 3 runs out of 3, i.e. it holds all 3 attempts of the final gate.
- Same subset on the 3c-1 versions of the 3c-2 files (`git restore --source=HEAD --worktree` of the 5
  sources + subscriptions.test.ts, the 2 new tests held aside, kaspa-rpc + localnet rebuilt): also
  x3 (and 19999 ×1, 8545 ×5 — identical). So the cut changes nothing in those tests; the 2 extra
  attempts of the earlier full gates come from tests outside the subset.
- Full gate on the 3c-1 versions with tracing + JSON reporter (`logs/3c2-trace-BEFORE-full.*`):
  2042 passed, 28 skipped (2070) — and `127.0.0.1:18210 x3`. The same tree gave x5 in
  `3c1-after2-gate1` at ~12:50. Same code, 5 then 3: environment noise, not the cut.
  Attribution by time (`attribute-attempts.cjs`, one file at a time): 1 attempt in
  `packages/dev-server/test/health.test.ts`, 2 (220 ms apart, one process) in
  `packages/sdk/test/sdk-parity-0-9-1.test.ts`. Neither touches the removed API.
- Then the worktree was put back: the 5 sources copied from the saved AFTER copies, the 2 tests moved
  back, subscriptions.test.ts deleted again; all 13 changed/new files hash to their qualified blobs;
  kaspa-rpc + localnet rebuilt and their dist is byte-identical to the packed AFTER tarballs (4 and 8
  files, 0 content differences).

## 8 · Transfer to the owner's checkout

- 14:22: HEAD still `a1e774f6e` (= origin/develop); working tree = exactly the qualified 3c-1 change;
  the 6 3c-2 targets equal HEAD's blobs; the 2 new tests absent.
- Deleted `packages/kaspa-rpc/test/subscriptions.test.ts`; copied the 5 sources and 2 new tests from
  the worktree (SHA-256 equal). All 13 changed/new paths of 3c-1 + 3c-2 hash to the qualified blobs.
- `git status`: 14 tracked changes + 4 untracked tests; `git diff --stat` 14 files, +2 −1131.

Two commits, disjoint (owner):
- 3c-1 (10 paths): `packages/kaspa-rpc/package.json`, `packages/kaspa-rpc/src/internal/resilient-subscriber.ts` (D),
  `packages/kaspa-rpc/test/resilient-subscriber.test.ts` (D), `packages/testing/test/gate-subpath-exports.test.ts`,
  `packages/toolkit/package.json`, `packages/toolkit/src/index.ts`, `packages/toolkit/src/subscriptions.ts` (D),
  `packages/toolkit/test/wallet-watch.test.ts` (D), + new `packages/kaspa-rpc/test/surface-cut-resilient-subscriber.test.ts`,
  `packages/toolkit/test/surface-cut-subscription-manager.test.ts`. Qualified: gate 2042/0/28.
- 3c-2 (8 paths): `packages/kaspa-rpc/src/index.ts`, `packages/kaspa-rpc/src/json-rpc-client.ts`,
  `packages/kaspa-rpc/src/provider.ts`, `packages/kaspa-rpc/src/upstream/session.ts`,
  `packages/kaspa-rpc/test/subscriptions.test.ts` (D), `packages/localnet/src/provider.ts`, + new
  `packages/kaspa-rpc/test/surface-cut-subscriptions.test.ts`, `packages/localnet/test/surface-cut-subscriptions.test.ts`.
  Qualified on top of 3c-1: gate 2038/0/28.

## 9 · Release-note text for the owner (breaking in the RC; no changeset written)

> **Breaking (vs 0.12.0-rc.25): HardKAS no longer ships its own RPC notification layer.**
> - `@hardkas/kaspa-rpc`: `KaspaRpcClient` is request/response only. Removed `subscribeToUtxosChanged`,
>   `subscribeToVirtualChainChanged`, `on` and `off` from the interface and from `JsonWrpcKaspaClient`,
>   `KaspaJsonRpcClient`, `LoadBalancedRpcProvider` and `MockKaspaRpcClient` (and from `@hardkas/localnet`'s
>   `LocalnetSimulatedProvider`); removed the types `UtxosChangedEvent`, `VirtualChainChangedEvent`,
>   `RpcAcceptedTransactionIds` and `KaspaSubscription`. This includes `hk.rpc` in `@hardkas/sdk`.
> - `@hardkas/kaspa-rpc/internal/resilient-subscriber` is no longer exported.
> - `@hardkas/toolkit`: removed `WalletSubscriptionManager`, `WalletWatchHandler`, `WalletSubscriptionEvent`.
> - Earlier in the same cut: `hardkas.events` and the `@hardkas/rpc-events` package are gone.
> - Use instead: `WalletToolkit.watch()` (kaspa-wasm `UtxoContext`; it resyncs after a reconnect and
>   requires a node), `hardkas tx wait` / `tx status` (polling), or kaspa-wasm's `RpcClient` for raw node
>   notifications.

## 10 · Committed (owner) and verified

- The owner committed 3c-1 + 3c-2 together as `0f4c2f26b` ([KLD] 0.12.0-rc.26 version, 17:50), parent
  `a1e774f6e`, pushed (HEAD = origin/develop), tree clean. `git diff --name-status a1e774f6e HEAD` =
  exactly the 18 paths; the 13 changed/new files have the qualified blob ids; the 5 deleted paths are
  absent. HEAD is exactly the tree that passed `3c2-after-gate1` (2038/0/28).
- Worktree `%TEMP%\hk-3c1\wt` removed with `cut8-3c2/safe-rm-quiet.mjs` (no link followed) + `git
  worktree prune`: 8 424 files, 2 598 dirs, 0 links. 0 links is impossible with pnpm's node_modules
  present (Node reports its junctions as links — checked), so the worktree's node_modules was already
  gone before the removal; so were the tarball extraction dirs `x-*` of hk-3c1 and hk-3c2 (they
  existed at 14:21). I ran nothing that touches them between 14:22 and 18:03. Likely cause: C: has
  3.8 GB free, and those files carry the 1985 mtimes npm/pnpm tarballs use, which an age-based temp
  cleaner removes. Nothing qualified was lost: tarballs, consumers and JSON reports remain; the
  extractions can be redone from the tarballs.
- Disk: my evidence dirs hold ≈1.3 GB (hk-3a 0.48, hk-3b 0.24, hk-3c1 0.37, hk-3c2 0.25); the test
  runs left 4 347 temp dirs (0.16 GB) — tests that do not clean their mkdtemp dirs (test debt).

## Not touched, as ordered

`WalletToolkit.watch()`, `createUtxoContext`, `UtxoContext`, `Hardkas.open()`, every request/response
member, `LoadBalancedRpcProvider` (only its 4 subscription members and the private getter they used
went), tx wait/status, `@hardkas/query` `./*`, `packages/cli/out/`, `KaspaWrpcClient.onNotification`
(0 consumers; a separate notification hook outside `KaspaRpcClient` — a candidate to look at later).
