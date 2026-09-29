# Surface Cut · next cuts · item 1 — network parameters from the SDK (2026-09-29)

GO (reviewer, pasted): "El orden del inventario también me parece sensato: parámetros de red → dead code → eventos/UtxoContext → GHOSTDAG → decisión PSKT → serialización/direcciones/keys. Mantendría exactamente la disciplina …: demostrar sustitución antes de borrar."
Start tree: owner commit d63f57bdf + my 7 uncommitted lines (silver test doc note + runner comment).

## Differential (netparams-differential.mjs → netparams-1.json; read-only)
Coinbase maturity, core table vs kaspa-params vs kaspa-wasm 2.1.0 getNetworkParams:
- mainnet 244 / 1000 / 1000 (table WRONG) · testnet-10 100 / 1000 / 1000 (WRONG) · testnet-12 100 / absent / 1000 (WRONG) · simnet 1000 / 1000 / 1000 · simnet-1 1000 / absent / 1000 · devnet 100 / 1000 / 100 · testnet-11 100 / absent / SDK aborts ("unreachable") · simulated 100 / absent / invalid type · igra unresolved / absent / invalid · testnet unresolved / 1000 / missing suffix.
- User maturity kaspa-params == SDK everywhere known (100; devnet 10).
- Devnet: rusty-kaspa v2.1.0 params.rs DEVNET_PARAMS uses BlockrateParams::new::<10>() → consensus coinbase maturity 1000; wallet-core settings.rs has literal devnet coinbase 100 / user 10 → the SDK's getNetworkParams (wallet-core) is below consensus on devnet. Upstream issue candidate (draft below).
Default RPC listen (node-orchestrator) vs RpcClient.defaultPort(SerdeJson): mainnet 18110 = 18110 · testnet-10/11/12 18210 = 18210 · simnet 18210 (HardKAS canonical localnet) vs SDK 18510 · devnet 18310 vs SDK 18610 (WRONG) · simnet-1 undefined → "ws://undefined" (BUG).
Consumers of the table: sdk wallet.open (→ toolkit sweep, the exposed defect on mainnet/testnet), sdk tx.plan synthetic path (no effect), cli tx-plan-runner pre-filter (redundant: the service re-filters with the SDK), cli localnet fund ×2 (simnet, unchanged value). kaspa-params maturity fields: no consumer.

## Change (uncommitted)
- NEW packages/core/src/network-params.ts: sdkNetworkParams (SDK getNetworkParams; simulated → simnet; testnets other than 10/12 refused before the call because the SDK aborts; errors NETWORK_PARAMS_UNRESOLVED), getCoinbaseMaturity (same signature, override wins, else SDK; COINBASE_MATURITY_UNRESOLVED), defaultRpcListen (simnet/simulated → canonical localnet; else RpcClient.defaultPort, suffix-agnostic; RPC_PORT_UNRESOLVED).
- core index.ts: the table removed, network-params exported. kaspa-params.ts: coinbaseMaturityDaa / walletUserTxMaturityDaa removed (unused SDK duplicates); header says only what no API exposes (finality) is copied.
- tx-builder kaspa-wallet-adapter.ts: coinbaseMaturityOf → core getCoinbaseMaturity; networkParamsUpstream comment corrected (the SDK has no dust/min-relay).
- node-orchestrator paths.ts: getDefaultRpcListen → core defaultRpcListen (devnet 18610, simnet-1 SDK port, simnet canonical unchanged).
- docs: apps/docs failure-taxonomy COINBASE_MATURITY_UNRESOLVED meaning corrected.
- tests: core/test/network-params.test.ts (6: SDK differential, 1000 on mainnet/testnet, simulated/override, fail closed incl. testnet-11 without the abort, ports, no maturity copy); node-orchestrator args.test.ts +1 (default listen).
Behaviour: simnet values unchanged (maturity 1000, listen 18210) → localnet flows unchanged. testnet-11 now fails closed early with COINBASE_MATURITY_UNRESOLVED (before: 100, then the planner's own SDK call aborted in WASM). config defaults still list a testnet-11 network (stale, left for hygiene).

## Qualification
- typecheck + build: core, tx-builder, node-orchestrator, sdk, toolkit, cli OK.
- targeted: network-params, node-orchestrator args, kaspa-wallet-adapter, wave2-a derive-tx-status, wave2-a tx-observer, generator-plan: 87/87.
- hermetic gate: phase1/cut4-netparams-gate1 → PASS first run: 901 files, 2045 tests, passed 2017 / failed 0 / pending 28, failedSuites 0, 726 s; non-loopback attempts 0 (loopback 18210 ×5, 19999 ×1, 7420 ×2, 8545 ×9, same kinds as earlier gates). +7 over the Silver-deletion gate (2010) = the 6 + 1 new tests.
- not run: gauntlet / acceptance against a real localnet. Reason: simnet values are unchanged (maturity 1000 from the SDK = the former table's 1000; listen 18210 = canonical), so localnet flows take the same values; the changed paths (mainnet/testnet maturity, devnet port) are not reachable from a localnet run.
- tree at gate1: d63f57bdf + 8 modified + 2 new (network-params.ts, network-params.test.ts); includes the 7 Silver lines from before.

## Found after gate1 (before reporting): a second copy of the devnet port
- packages/config/src/defaults.ts had devnet `rpcUrl: "ws://127.0.0.1:18310"`, the same wrong port the orchestrator had. After the gate1 change the orchestrator fallback said 18610 and the config default 18310: my change had split them. (grep: 18310 appears nowhere else.)
- Who uses what: the CLI never starts a devnet node (no CLI import of node-orchestrator's process/start; node-orchestrator is used only for `resolveRuntimeConfig(...).rpcUrl` fallbacks in accounts-real-utxos/-balance, accounts-balance and tx-plan runners). The config rpcUrl is read by the SDK resolveRpcUrl, rpc doctor, localnet/deployment/script runners, `config` command. So devnet's port is only a client default, and the right one is kaspad's own default = SDK RpcClient.defaultPort = 18610.
- Fix: config default devnet rpcUrl → ws://127.0.0.1:18610, kept as a literal because DEFAULT_HARDKAS_CONFIG is built on import, possibly before kaspa-wasm is installed (calling the SDK there would break init/config without WASM); dropping rpcUrl is wrong too (SDK resolveRpcUrl falls back to 18210, the canonical simnet). Pinned to the SDK by a test: config/test/config.test.ts "default node endpoints" (devnet == `ws://${defaultRpcListen("devnet")}`, simnet == canonical localnet).
- targeted cut4-netparams-config1: 21/21 (config, orchestrator args, network-params). config typecheck then failed on the new test (TS18048 `networks.devnet` possibly undefined, noUncheckedIndexedAccess) → `?.`; typecheck 0, build OK; cut4-netparams-config2 8/8.
- gate2 on the final tree: phase1/cut4-netparams-gate2 → PASS first run: 901 files, 2046 tests, passed 2018 / failed 0 / pending 28, 761 s; non-loopback 0 (same loopback targets). +1 over gate1 = the config test.

## Owner commit during gate2
- e52a4942d "[KLD]: 0.12.0-rc.26 version", 12:32:27, on develop (the parallel session's memory says pushed): the root cleanup (26 renames, 26 deletes) + all of item 1 (incl. the config fix) + the 7 Silver lines.
- It also contains 2 test temp files: A packages/cli/test/temp_pskt_3724ffe9/{plan.json,session-0.json}. Cause: packages/cli/test/pskt-cli.test.ts:11 makes its temp dir inside the source tree (`resolve(__dirname, "temp_pskt_<hex>")`), not gitignored; gate2 was running it when the tree was staged. The test's cleanup removed them afterwards → working tree shows ` D` for both. Not touched by me (index/commits are the owner's); told to the owner: commit the deletion; offer to move the test's temp dir to the OS temp dir.
- Tests vs the root cleanup: no package test, vitest config, root package.json script or workflow references the moved/deleted root files (grep); scripts already point at docs/internal/audit/gauntlet.
- gate3 on HEAD e52a4942d (working tree = HEAD minus the 2 temp files): phase1/cut4-netparams-gate3-head → PASS first run: 901 files, 2046 tests, passed 2018 / failed 0 / pending 28, 704 s; non-loopback 0. Run because gate2 overlapped the commit and never saw the root cleanup from the start.
- Older leaks of the same test, found while checking: 3 more dirs tracked since July — temp_pskt_09a68b02 (4fd4ed0ef, 2026-07-20), temp_pskt_41b37a57 (388c898d5, 07-21), temp_pskt_56131723 (346e9b60a, 07-24), all [KLD] 0.11.4-alpha; 14 files. Their key.txt / key2.txt are the test's own placeholders (pskt-cli.test.ts:103/113 writes "fake-key" / "fake-key-2"; checked by length/format only, not printed) — no real key. Offered to the owner: test temp dir → OS temp dir + remove the 4 dirs from the working tree for his commit.

## Upstream issue draft (owner posts; kaspanet/rusty-kaspa)
Title: wallet-core devnet maturities are below the 10-BPS consensus values
`wallet/core/src/utxo/settings.rs` (v2.1.0) sets devnet `coinbase_transaction_maturity_period_daa` to 100 and `user_transaction_maturity_period_daa` to 10, while `DEVNET_PARAMS` uses `BlockrateParams::new::<10>()`, so consensus coinbase maturity on devnet is 1000 DAA (as on mainnet, testnet-10 and simnet, where wallet-core already says 1000/100). `getNetworkParams("devnet")` in the WASM SDK therefore reports a coinbase maturity 10× shorter than the node enforces, and a wallet using it can select immature coinbase outputs. Also: `getNetworkParams("testnet-11")` aborts with `unreachable` instead of returning an error.
