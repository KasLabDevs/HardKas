# Surface Cut · Phase 2 · planner → official Generator

GO (reviewer, pasted 2026-09-29): "sí le daría GO a fase 2 con “dust = reject” y “multi-tx = fail closed hasta tener batch lifecycle”". Fix the adapter's feeRate; dust change → clear refusal; multi-tx → MULTI_TRANSACTION_PLAN_REQUIRED; "Generator oficial → adaptador HardKAS → evidencia HardKAS"; delete coin selection / fee estimator / own synthetic planner only once the differential cases are green.
Base: develop a455d6b98 (owner's rc.26 commit; tree clean at start). HARDKAS_HOME %TEMP%\hk-v210-gate-home (kaspa-wasm 2.1.0).
NO commit / push / publish / changeset / version bump (owner).

## Differential (read-only, before any change) — runs 1-4, compound-node-check-1
See planner-differential.mjs / -1,-2,-4.json and diferencial-planificador.html (artifact AFPdgJiMX49916hBrjXErz).

## 2a · what changed
- tx-builder/src/generator-plan.ts (new): planWithGenerator / planPaymentWithGenerator / GeneratorPlanError. One transaction or a refusal:
  MULTI_TRANSACTION_PLAN_REQUIRED (Generator yields >1 tx), CHANGE_BELOW_STANDARD_OUTPUT / OUTPUT_BELOW_STANDARD_AMOUNT (Generator "Storage mass exceeds maximum" or "Mass calculation error" = final tx above max standard mass), INSUFFICIENT_FUNDS_UPSTREAM, GENERATOR_PLAN_INCONSISTENT (conservation guard), UPSTREAM_PLANNER_UTXO_MISSING.
  Synthetic identities (simulator): aliases → fixed P2PK simnet stand-in; addresses of other networks re-encoded on simnet (same script ⇒ same mass); non-hex txids → sha256; mapped back.
  Sweep (consolidation): no `outputs` key and no priorityFee (probe: `outputs: []` is refused "Transactions with output must have Fees::SenderPays…"; priorityFee in a sweep refused).
- service.ts rewritten: planTransactionUpstream / planTransactionSynthetic / planConsolidation all on the Generator; legacy planTransaction (largest-first + convergence), maxInputsPerTx/warnInputs/marginFeePerInput, feePolicy/feeEstimator/genesisCovenantGroups (no consumers) removed. Synthetic detail `hardkas.simulator/kaspa-wasm@<v>`. Consolidation gains networkId/simulated.
- kaspa-wallet-adapter.ts: feeRate passed through (was an invented `priorityFee:{amount,rate}` → rate ignored); outputs optional (sweep); BUG FIX: maturity read `coinbaseTransactionMaturityPeriod`/`coinbaseMaturity` (absent in 2.1.0) → always fell back to 1000; real field `coinbaseTransactionMaturityPeriodDaa` (simnet/mainnet/testnet-10 = 1000, devnet = 100). Now fail-closed if absent.
- mass.ts: `measureRelayFee` (node's relay rule: SDK fee of the same tx with storage-neutral amounts = min rate × compute mass); `minimumFeeSompi` doc corrected (SDK figure, prices storage too). tx-builder verify.ts + artifacts feeVerify.ts flag FEE_BELOW_NETWORK_MINIMUM only below the relay fee (checked lazily, when below the SDK figure).
- Deleted: engine.ts, coin-selector.ts, fee-estimator.ts (+ tests engine, coin-selector, fee-estimator, fee-convergence, service, plan-differential); SDK env `coinSelector.select` / `feeEstimator.estimate` (deprecated).
- Ported: generator-plan.test.ts (the 33 differential cases + mass-calc-error, accepted small change, excludeOutpoints, maturity, cross-network, synthetic, consolidation); qf005 A1 now proves the Generator pays exactly the node's 203600 for compute mass 2036; wallet-adapter case 4 (integrated the deleted engine) → signer-only.
- Docs: planning.md, error-model.md, fees-and-mass.md (apps/docs), first-transaction, error-recovery, why-hardkas, utxo-management; consolidate runner message.

## Decisions NOT taken (for the reviewer)
- Input ORDER. Upstream wallet (UtxoContext) feeds mature UTXOs ascending by amount (context.rs: sorted_insert_binary_asc_by_key / sort_by_key amount; iterator.rs: index order). The Generator takes entries in given order and only absorbs classic dust change (is_dust) — a small non-dust change is refused. Probes (dust-selection-probe, dust-order-probe):
  10+5 KAS pay 10−fee−1000 → refused (desc) / OK (asc); 5400×1000 sompi + 500 KAS pay 100 → asc "Transaction fees are too high", desc 1 input fee 203600; 50 dust + 500 KAS → asc 51 inputs fee 5.79M; 200×0.01 + 500 → asc 4 txs.
  Kept: the source's order (as the previous upstream path did). No own policy added.
- 2b (delete buildPaymentPlan/planSingleOutputSpend): applySimulatedPayment and harness.send() are SYNC; the Generator is async only → both become async → breaks `hardkas init` template tests (templates/basic.ts `h.send(...)`), dummy-project, script/console runners, torture buckets. Needs a decision.

## Not mine (appeared during the run, 02:42:44)
.gitignore (+/my-test-project/), apps/docs/scripts/migrate-html.js, scripts/post-release-break-gauntlet.mjs, scripts/toccata-gauntlet.mjs (reports → docs/internal/audit/gauntlet/). Untouched.

## Evidence
- p2a-run1: 59/62 (3 consolidation: sweep with `outputs: []` refused) → fixed → p2a-run2 62/62 (generator-plan 41, planner-dispatch 5, wave13 7, adapter 9).
- typecheck: tx-builder, sdk, wallet-adapter, toolkit, localnet, accounts, bridge-local, testing, cli = 0 errors.
- build (p2a-build.log) 47/47; pskt-native .node restored.
- FULL GATE 1 (p2a-gate1, first result kept): 1999 pass / 6 fail / 28 skip, 758 s.
  - 4 × "ECONOMIC_VIOLATION Fee below network minimum: artifact pays 203600, the node requires 1000000" (cli wave1-5 narratives, wave2-e ×2; sdk e04: "pays 300000, requires 300200") → REGRESSION of mine, root cause in HardKAS evidence: feeVerify (artifacts) and verifyTxPlanSemantics (tx-builder) used measureUpstreamMass().minimumFeeSompi = SDK calculateTransactionFee over the OVERALL mass. Generator fee model measured (generator-fee-probe*.cjs): fee = max(100 × compute mass, feeRate × overall mass); pt.mass = overall. Node rule = 100 × COMPUTE mass (compound-node-check-1: fund txs overall mass 80038, fee 492000 accepted, SDK "minimum" 8003800; node's own QF-005 rejection text "…required amount of 203600 for compute mass 2036"). With feeRate 100 the Generator prices mass 3000 but the final tx (smaller change) is 3002 → SDK figure 300200 > fee 300000.
    Fix: measureUpstreamMass adds computeMass + relayFeeSompi (SDK fee of the same tx with storage-neutral amounts); both verifiers check relayFeeSompi. minimumFeeSompi (pricing for Silver etc.) unchanged. The real-network path had the same latent bug (any storage-bound Generator plan would fail at sign).
  - sdk mempool-aware-planning "The address is invalid" → REGRESSION of mine: the adapter derived every entry's script from its address; that test's (mock) RPC UTXOs carry a script and no address (the old upstream path passed the UTXO's own script). Fix: real UTXOs use their own script (node JSON form "<version><script>"; bare script = version 0); the address only when there is no script; simulator always the stand-in's.
  - cli scaffold-versions (`hardkas init` e2e) timed out: 19.8 s under full-gate load vs 3.2 s isolated, limit 5 s → ENVIRONMENT/timing; not planner-related.
- p2a-run3 (the 5 files + generator-plan + mass-upstream + verify + qf005 + packages/artifacts/test): 440/440. p2a-run4 generator-plan 43/43 (+ node-rule verifier case, + address-less real UTXO case).
- build2 47/47; .node restored.
- FULL GATE 2 (p2a-gate2, first result kept): 2006 pass / 1 fail / 28 skip, 684 s. cli wave1-3-verify-cli "D-Q1.f artifact migrate": `hardkas verify --json` printed a correct result (5/5 ok) then the process aborted at exit: "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76" (exit 3221226505). Repeated 8/8 (p2a-verifycli-1..8) → deterministic with that change.
  - Cause chain: my eager relay-fee computation (a second SDK Transaction per measureUpstreamMass) raised the WASM workload of `hardkas verify` past a threshold; the abort itself is a Node 24.15.0-on-Windows exit bug: pure kaspa-wasm (exit-probe-raw.cjs, no HardKAS code) building ≥~20 Transactions then process.exit(0) aborts 4/4; natural exit (process.exitCode) 0/4; `--single-threaded` 0/4; `--single-threaded-gc`, `--no-wasm-tier-up`, global.gc() do not help; setTimeout(exit,0) 1/4. Phase 1's RpcClient abort (worked around with the `ws` shim) is the same family.
  - Fix of my regression: relay fee computed lazily (`measureRelayFee(input)` = measureUpstreamMass on storage-neutral amounts), only when the fee is below the SDK figure; measureUpstreamMass restored to HEAD (doc only). p2a-verifycli-lazy-1..4: 4/4 pass.
  - Pre-existing (not fixed, chip task_a01783d3): `hardkas verify` on a simulated workspace with 10 plans aborts at exit 2/3 (exit-verify-workspace.mjs; 1/3/6/16 plans ok — non-monotonic), with verification WASM work identical to HEAD. Proposed fix: CLI exits naturally (process.exitCode + unref'd fallback timer).
- p2a-run5 (verify-cli, narratives, wave2-e, mempool-aware, e04, packages/tx-builder/test, packages/artifacts/test): 491/491.
- build3 47/47; .node restored.
- FULL GATE 3 (p2a-gate3): 2007 pass / 0 fail / 28 skip, 698 s. Loopback 127.0.0.1:18210 x5 (same pre-existing tests as gates 1-2; no node up).
- GAUNTLET (gauntlet-1, canonical localnet rusty-kaspad v2.1.0 started from %TEMP%\hk-v210-node-ws, HARDKAS_HOME = gate home): 16/16 PASS, HARDKAS_TOCCATA_BASELINE_READY. Standard lifecycle plans = KASPA_WASM_GENERATOR kaspa-wasm@2.1.0: fund 21 inputs fee 2439600 mass 24396 (= the node's historical "required amount of 2439600 for compute mass 24396"); payment 1 input fee 203600 mass 2036. Report written by the owner's new script path docs/internal/audit/gauntlet/TOCCATA_GAUNTLET_RESULT.json (untracked; owner decides). Localnet stopped after.
- PACK (pack2): build 0, 25 tarballs, tree byte-identical before/after pack, inspection 0.
- ACCEPTANCE (qual-v210.cjs on pack2, %TEMP%\hk-phase2-qual, empty project + empty HARDKAS_HOME per journey, first run): 61/61 — install 6, A (simulator) 15, C 4, D 1, A-pnpm 5, B (localnet + mining, real submission) 19, E 11. No containers left.
- After packing I tried a script cache per address in generator-plan.ts and reverted it (tree must equal what was qualified): tree-final vs tree-after 3443 files, 0 changed.

## 2b · option B (reviewer, pasted 2026-09-29)
Decisions: keep the source's UTXO order (any order policy must be explicit and differentially qualified); 2b = B: migrate every consumer that is already async, keep `buildPaymentPlan` only behind the synchronous harness, marked as a COMPATIBILITY SHIM (not a planner), no new consumers; retire it later in a dedicated API migration. Next cut after this: Silver (official runner as execution backend), then PSKT. Query Store / Evidence: only concrete defects.

What changed:
- tx-builder: `buildPaymentPlan` JSDoc @deprecated COMPATIBILITY SHIM; `planSingleOutputSpend` DELETED (after the toolkit migration nothing used it; the harness only uses buildPaymentPlan) + its mass-upstream test case; generator-plan `payload` pass-through (Generator prices it); planConsolidation insufficient error carries code INSUFFICIENT_FUNDS_UPSTREAM.
- New guard test tx-builder/test/compat-shim-consumers.test.ts: scans packages/examples/labs/apps/scripts code (skips node_modules/dist/out/build/.hardkas…): buildPaymentPlan allowed only in tx-builder/src/index.ts, localnet/src/transactions.ts (applySimulatedPayment) and tx-builder's own tests; planSingleOutputSpend nowhere.
- Migrated to the Generator: toolkit sweep/consolidate (private planSweep → TxPlanService.planConsolidation; networkId from getBlockDagInfo); cli kaspa-wallet-runner (planPaymentWithGenerator, real network, own scripts + coinbase data passed); testing utxo-fuzzer (Generator plan over simulator identities → createTxPlanArtifact → applySimulatedPlan of THAT plan; new state invariant value falls by exactly the fee; `applied` counter, test asserts > 50 of 100); bridge-local planBridgeEntry → async (payload priced; synthetic identities; callers: cli bridge-local-runner awaits ×2, simulator-adapters already async); examples/04 (await planPaymentWithGenerator, synthetic); SDK re-export buildPaymentPlan → planPaymentWithGenerator, unused import in sdk/tx.ts removed; labs merchant-terminal fake exercise → planPaymentWithGenerator.
- Kept on the shim: localnet applySimulatedPayment (doc says so) → testing harness.send(), CLI script/console runners, templates, torture buckets.
- Docs: planning.md note (harness send() on the shim), apps/docs/docs-data/cli-semantics.ts + generated reference/cli/tx.md (planner path + limitation were stale: "CLI uses buildPaymentPlan", "Candidate B not wired").
- Noted, not touched: packages/cli/out/ = 380 tracked stale compiled files (old runners still reference buildPaymentPlan) → Repository Surface Audit debt. examples/04 does not typecheck with tsc even at HEAD (tsconfig extends a missing root file; unrelated type errors); it runs with tsx.

Evidence:
- typecheck: tx-builder, localnet, testing, toolkit, bridge-local, sdk, simulator-adapters, artifacts, cli = 0.
- p2b-run1 (tx-builder, testing fuzzer, toolkit, bridge-local, localnet, simulator-adapters): 215/215; guard 2/2; fuzzer 3/3 more runs (p2b-fuzz-1..3) with applied > 50.
- bridge-plan-probe: 38-byte payload → mass 2112 vs 2036 without, fee 211200.
- build p2b-build1 47/47 (incl. showcase tsc); .node restored.
- FULL GATE 2b (p2b-gate1, first run): 2008 pass / 0 fail / 28 skip, 689 s (net +1 vs 2a: +2 guard tests, -1 planSingleOutputSpend case). Gauntlet and tarball acceptance not re-run: the journeys they cover (tx plan/sign/send, localnet) are unchanged in 2b.
