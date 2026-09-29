# Wave 2(a) security fix — observer locality (`WAVE_2A_SECURITY_REVIEW — BLOCK`, one blocker)

Mandate: fix ONLY the blocker "observations from different sources cannot form one temporal history without a stable observer identity"; add the four mandated regressions; run them plus the directed Wave 2(a) set; hand back for the short review. No D-Q1.a (endpoint normalisation) work. No AUD-17/AUD-28.

## 1. Blocker, restated

`deriveTxStatus` ordered ALL observations of a txId by `sinkBlueScore → observedAt → contentHash` and read the sequence as one timeline. Two observers indistinguishable in the authenticated body (same `networkId`/`serverVersion`/`capabilities`; `rpcUrl` unauthenticated) could therefore be merged into a fabricated causal story: `A: chain_accepted(B)` + `B: chain_removed(B)` ⇒ `REORGED`; `A: finality_reached(B)` + `B: chain_removed(B)` ⇒ "finality violated". Determinism of the algorithm was mistaken for validity of the inference.

## 2. Fix (minimal)

1. **Stable opaque observer identity** — `observer.observerId` (`obs_<64hex>`, REQUIRED, authenticated) in `hardkas.txObservation.v1` (`packages/artifacts/src/schemas.ts`). `deriveObserverId({ kind, target, locator? })` (`tx-observation.ts`) = `obs_` + domain digest of the observer's configuration; the locator is never exposed. It means only "these observations come from the same logical HardKAS observer instance", not "this node". Registered as `CORRELATION` in the IC-7 registry (never an artifact reference).
2. **SDK** — `sdk.tx.observerId()` derives it from the configured target and its raw `rpcUrl`; `observeTxOnce` requires it (`ObserveTxOptions.observerId`) and seals it into every observation.
3. **Derivation per observer** — `deriveTxStatus` (`tx-status.ts`) now: groups valid observations by `observerId` → `deriveObserverHistory` per group (the ONLY place a sequence is read as a timeline: accepted→removed ⇒ `REORGED`; finality→removed ⇒ `CONFLICTING_OBSERVATIONS` "its own history is incoherent"; a `chain_removed` for a block the observer never accepted ⇒ `NOT_ON_CHAIN`, a negative claim) → combination without causality:
   - any intra-observer conflict ⇒ `CONFLICTING_OBSERVATIONS`;
   - positive chain claims (`ACCEPTED`/`CONFIRMED`/`FINALIZED`) from several observers on the SAME block ⇒ agreement reinforces; `confirmations` = the MINIMUM view; `FINALIZED` if one observer's view satisfies the rule and no observer disputes the block;
   - positive claims on different blocks, or a positive claim plus a negative one (`REORGED`/`NOT_ON_CHAIN`) from another observer ⇒ `CONFLICTING_OBSERVATIONS` with `observer_views_disagree` and, when a `FINALIZED` view is involved, the explicit reason "a disagreement between observers, not an observed violation of the finality rule in one virtual-chain history";
   - `REORGED` only when the observers that ever accepted all saw the SAME block leave their own chain; a lone `NOT_ON_CHAIN` establishes nothing (falls back to mempool / submission);
   - mempool-level views that differ across observers ⇒ `observer_views_disagree`; lagging observers (mempool/absence) never contradict a chain claim.
   - Output adds `perObserver: ObserverHistory[]` (each observer's own status, block, depth, latest point, evidence) and `observers[].observerId`; `evidence.observationArtifactIds` is the deciding observers' whole histories.

## 3. Regressions (all in `packages/artifacts/test/adversarial/wave2-a-derive-tx-status.test.ts`, test "observer locality")

| # | Case | Expected | Result |
|---|---|---|---|
| 1 | same observer: `accepted(B)` → `removed(B)` | `REORGED` | ✓ |
| 2 | different observers: A `accepted(B)`, B `removed(B)` (also with the points swapped) | NOT `REORGED`: `CONFLICTING_OBSERVATIONS`, `observer_views_disagree`, `perObserver` = A `ACCEPTED`, B `NOT_ON_CHAIN` | ✓ |
| 3 | same observer: `finalized(B)` → `removed(B)` | `CONFLICTING_OBSERVATIONS` ("its own history is incoherent") | ✓ |
| 4 | different observers: A `finalized(B)`, B `removed(B)` | conflict BETWEEN observers, `isFinal: false`, reason "not an observed violation of the finality rule", never "incoherent" | ✓ |
| + | `observerId` opaque (no locator inside), stable, required (producer refuses), authenticated (identity changes; the altered copy is ignored) | ✓ |
| + | two observers agree on one block ⇒ `CONFIRMED` with the minimum depth; a lagging mempool view does not contradict; a lone negative claim ⇒ back to `SUBMITTED`; different blocks across observers ⇒ disagreement | ✓ |

SDK (`wave2-a-tx-observer.test.ts`): every observation carries `sdk.tx.observerId()` (stable, `obs_<64hex>`), `status.observers[].observerId` and `perObserver` present. All previous T-RS-1…9 and observer/SDK cases unchanged and green.

## 4. Verification

| Run | Result |
|---|---|
| `w2a-fix1` (two 2(a) suites + IC-7 registry + canonical snapshot) | 37/38 → one SDK expectation updated (deciding evidence is the observer's whole history) |
| `pnpm typecheck` | 0 errors (55/55) after two exactOptionalPropertyTypes fixes; native `.node` restored |
| directed Wave 2(a) set `w2a-fix2` (artifacts, sdk, core, toolkit trees) | see §5 |
| lint (artifacts, sdk) / version:check | see §5 |

## 5. Results of the directed set

- `w2a-fix2` (artifacts, sdk, core, toolkit trees: 275 files): **697 passed / 0 failed / 6 skipped**, `gate-hermetic: PASS`, 0 non-loopback attempts (the 2 loopback targets on 127.0.0.1:18210 are the pre-existing `sdk.localnet.status()` probe).
- lint: `artifacts` 0 errors; `sdk` the 2 pre-existing errors only (`igra.ts:31`, `pskt/adapters/test-fake.ts:26`).
- `pnpm version:check`: all at `0.12.0-rc.23`, no newer reference.
- No full gate run for this fix (per the mandate: regressions + directed set); the last full gate on this tree minus this fix was `w2a-full1` 1851/0/28.

## 6. Derived decisions (for the short review)

1. `observerId` is a digest of `{kind, target, locator}`: two workspaces configured against the same locator share an observer id (same source ⇒ same history is legitimate); a spelling difference in the locator yields a different observer (conservative). A load-balanced provider is ONE logical HardKAS observer even though its answers may come from several nodes — this is the residual the interim identity cannot see; noted, not solved here (D-Q1.a territory).
2. `NOT_ON_CHAIN` is a per-observer negative claim (a `chain_removed` without prior acceptance by that observer); it disputes a positive claim of another observer but never establishes a reorg on its own.
3. `confirmations` across agreeing observers is the minimum view (never the most favourable one).
4. `sdk.tx.observe` still asks the current observer to re-check the block established by the COMBINED derivation (which may have been established by another observer); the resulting `chain_accepted`/`chain_removed` is that observer's own claim and enters its own history — corroboration or dispute, never inherited causality.

Nothing else changed. Version `0.12.0-rc.23`; nothing committed.
