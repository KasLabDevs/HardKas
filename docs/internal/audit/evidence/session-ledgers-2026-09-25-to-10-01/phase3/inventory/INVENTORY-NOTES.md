# Post-cut inventory (2026-09-29) — which remaining code implements Kaspa semantics that belongs upstream

Question (reviewer, after Silver step 3): "Después de quitar RPC, planner y Silver duplicados, ¿qué código restante todavía pretende implementar semántica que debería pertenecer a Kaspa upstream?"
Method: 4 read-only Explore agents over every package `src/` (groups: DAG/sim/localnet · tx/accounts/signing/sdk/toolkit/pskt · RPC/events/query/dev-server · core/artifacts/testing/escrow/bridge/l2/cli). Then I verified the load-bearing claims myself (marked V). Unmarked = agent claim, not re-verified. One agent claim was false (marked X).
Classes: A duplicates upstream · B Kaspa semantics owned by necessity · C product logic.

## A — duplicates upstream (agent totals ≈ 5.3k TS lines + ≈620 stale compiled files in rpc-events/src; ≈4k lines dead or unreachable overall)
1. GHOSTDAG + simulated DAG (simulator ghostdag-*/ordering/reachability/metrics/scenarios ≈1,061; localnet dag.ts 470).
   - V: DEFAULT_K = 18 labelled "Post-Crescendo mainnet (10 BPS)" (simulator/src/ghostdag-engine.ts:29-30); rusty-kaspa v2.1.0 consensus/core/src/config/bps.rs ghostdag_k(): 10 BPS → 124, 1 BPS → 18.
   - V: consumers: localnet/src/dag.ts (engine), testing/src/reproducibility.ts; `hardkas dag` runners use createSimulatedDag/moveSink (cli/src/runners/dag-runners.ts:4,52,82). cli + sdk package.json declare @hardkas/simulator but no src import.
   - V: capabilities.ts:158-159 "GHOSTDAG-aligned blue/red ordering" vs query "deterministic-light-model (NOT GHOSTDAG)" — contradictory claims.
   - agent: off-by-one K limit, corrupted anticone bookkeeping, own work formula; in production `hardkas dag simulate-reorg` never computes GHOSTDAG (side block built without GHOSTDAG data).
   - Upstream: node block verbose data / virtual chain; simpa for DAG-shape experiments.
2. Events / subscriptions / reconnect.
   - V: rpc-events (643 TS) only consumer = sdk `hardkas.events` (sdk/src/index.ts:36,182,246), which nothing calls; compiled .d.ts files live inside rpc-events/src.
   - V: kaspa-rpc/src/internal/resilient-subscriber.ts (265) only used by tests (+ build entry).
   - V: tx-builder createUtxoContext (the correct UtxoProcessor/UtxoContext wrapper) has no production caller.
   - agent: rpc-events not functional end to end (subscribe only when connected, address filter on non-existent fields, random dedupe ids); kaspa-rpc own reconnect (~50) with strategy "fallback"; plugin-rpc-backend own retry (~170) + amount bug; sync-daemon (214) functionally dead (no backend exposes `.client`) — V: raw legacy method name "getVirtualSelectedParentBlueScoreRequest" (sync-daemon/src/daemon.ts:144).
   - Upstream: RpcClient subscriptions + retry strategy, UtxoProcessor/UtxoContext.
3. Network parameters copied (some wrong).
   - V: core getCoinbaseMaturity table: mainnet 244, testnet 100, simnet 1000, devnet 100; kaspa-wasm 2.1.0 getNetworkParams: mainnet/testnet-10/simnet 1000, devnet 100. Wrong for mainnet and testnet.
   - V: real planner protected (tx-builder service.ts re-filters with the SDK value; cli tx-plan-runner pre-filter keeps isCoinbase/blockDaaScore). Exposed: toolkit WalletToolkit.sweep (wallet.ts:398-418) filters only with the table (sdk index.ts:188) → on mainnet/testnet can include immature coinbase UTXOs (node rejects). localnet fund recomputes with a second rule (agent).
   - Also: dust 600 in 3 places, K=18, hardcoded ports (node-orchestrator paths.ts, kaspa-rpc, dev-server), getNetworkPrefix.
   - Upstream: getNetworkParams, RpcClient.defaultPort, Address/NetworkId.
4. Hand-made serialization, addresses and scripts.
   - agent: accounts wasm-rpc-serialization.ts (~160) injects signature scripts into a HardKAS JSON, which kaspa-rpc toOfficialTransaction converts back (double conversion).
   - V: accounts real-accounts.ts validateAddressPrefix has no `kaspadev:`; validateAddressNetwork maps devnet → `kaspasim:` (devnet addresses rejected). agent: artifacts verify.ts rejects kaspadev too.
   - V: artifacts submission-fee.ts decodeKaspaAddress decodes bech32 without checksum ("the node does") + hand-built scripts; runs on every `tx send` (agent).
   - agent: script-public-key string parsing copied 5 times with disagreeing rules.
   - Upstream: Transaction + serializeToSafeJSON / RpcClient.submitTransaction({transaction}), Address.validate, payToAddressScript, ScriptPublicKey.
5. PSKT.
   - V: default adapter WasmPsktAdapter reports every operation false and throws (sdk/src/pskt/adapters/wasm.ts); the SDK registers only it + an "unavailable" fallback (sdk/src/pskt.ts:21-23); registerNativeAdapter() has no production caller → `hardkas pskt export|sign|finalize|extract` cannot work; pskt-native (≈1,428 + Rust) unreachable from CLI/SDK.
   - agent: pskt-native pins rusty-kaspa rev 78257f27 ("2.0.1"), not 2.1.0; build_unsigned_tx duplicates kaspa-wallet-pskt.
6. Fees heuristics and pre-Generator utilities.
   - agent: toolkit fee-estimator floors 1/2/5 + mempool multipliers; sdk fees.ts hard-coded 100n; toolkit utxos planners (212, dead); toolkit dag/consensus (146, dead, "blue score" = longest path); accounts consolidate batching 512 cap (≈88-input limit); KAS↔sompi ×3; `hardkas dev tx generate` (→ rothschild).
7. ZK: V `zk verify` compares fixture digests only; message "Failed to cryptographically verify local ZK proof fixture" (cli/src/commands/zk.ts:50) overstates. Upstream: kaspa-txscript-zk-sdk. → Labs.
8. agent (not verified): accounts address-manager / wallet-manager derive keys as sha256 (no BIP32/39) and feed WalletToolkit.receive → sdk.wallet addresses; testnet-qualification daa-observer = a second tx-state model; bridge-local IGRA payload + prefix mining over a HardKAS digest.

## B — owned by necessity (keep, ≈2.2k TS + ≈390 Rust)
- core silverscript-abi.ts: only entry-arg → sig-script encoder (no JS silverscript-abi). X: agent said "no golden vectors" — false: core/test/silverscript-abi.test.ts checks 30 upstream vectors byte for byte.
- accounts silver-covenant.ts (Toccata v1: Generator has no covenant/compute budget), silver-spend.ts (custom unlock pricing + multi-party draft), silverscript-runner.ts scenario rebuild (caveat: negative signed tests can pass for the wrong reason → documented 29-sep), tx-builder mass.ts measureRelayFee + generator-plan error classification (SDK has no compute-only API / only error strings), kaspa-rpc subscription multiplexing (~118), finality depth constant (no RPC), observation-based tx status, localnet offline UTXO ledger (only if the Docker-free simulator stays).

## Defects found on the way (not duplication)
- V dev-server escrow reconcile never confirms: getTransaction → null (node has no tx index; kaspa-rpc index.ts:517-525) at routes/escrow.ts:243,265,428. Same pattern: toolkit query-api.ts:120,131; cli deployment-runners.ts:202. Correct model exists: sdk tx-observer (virtual chain).
- V toolkit sweep with the wrong maturity table (mainnet/testnet).
- V capabilities "GHOSTDAG-aligned" vs query "NOT GHOSTDAG"; V zk verify wording.
- V devnet addresses rejected by accounts validation.
- V CLI imports but never registers l2, metamask, bridge, dev-server command groups (program.ts:10,26,30,50) → their commands/runners unreachable (agent: ≈2.2k lines).
- agent (not verified): LocalnetSimulatedProvider outpoint parsing (txId = output index), fork.ts stamps caller DAA, plugin-rpc-backend amounts, node-orchestrator no --simnet flag, torture bucket mock compiler cannot fail, tx-verify-runner passes simulator plans unchecked, corpus sig-leak regex misses 0x81–0x84.
- V packages/sdk/package/{LICENSE,package.json} tracked (tarball leftover, bumped each version); @hardkas/artifacts now unused by @hardkas/simulator.
