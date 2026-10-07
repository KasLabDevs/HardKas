# JSON-PAPERCUTS + PAPERCUTS-2 · ledger (2026-10-04/05)

## Order (owner, via the reviewer's package)

JSON-PAPERCUTS: #5 `artifact lineage --json` prints text · #39 `deploy track --json` prints no JSON ·
#40 `tx profile --json` prints no JSON · #19 `tx send --track --json` can end `ok:true`, exit 1, with the
tracking failure unexplained · `replay verify --json` success envelope has no `ok`.
PAPERCUTS-2: #37 built-in default declares the deprecated `defaultNetwork` · #38 templates and generated
configs declare it too · #44 dead `mode === "simulated"` checks (one hides MISSING_TRACE) · #45 version
literal in the snapshot manifest · #35 `hardkas init` scaffolds no `@hardkas/cli`.
Out of scope, untouched: #20 #34 #4 #28 #41–43 #6–18 #31 #46–56 #61.

Standing: no commit / push / publish / bump; the owner commits. Tree: develop at 062062684, all changes
uncommitted. A parallel session (evidence-diff redaction) edits `artifacts/src/diff.ts`,
`core/src/security.ts`, `localnet/src/replay.ts` in the same checkout; nothing here depends on it.

## BEFORE (HEAD source through tsx, fresh simulated workspace; `before/*.log`, scripts in `probes/`)

| # | command | observed |
| --- | --- | --- |
| 40 | `tx profile plan.json --json` | exit 0, stdout empty, the text profile on stderr |
| 5 | `artifact lineage signed.json --json` | exit 0, the text report on stdout, no JSON |
| 39 | `deploy track … --json` | exit 0, no JSON; duplicate label → `code: "UNKNOWN_ERROR"` |
| 19 | `tx send signed.json --track <taken> --json` | `ok:true, outcome:"submitted"`, exit 1, no mention of the record |
| RV | `replay verify <receipt> --json` | exit 0, no `ok` field |
| 37 | `config show --json` in a directory without config | keys `defaultNetwork, networks, accounts`; no `execution` (the DEPRECATED warning does not fire in `tx plan` flows, in any of the three workspaces) |
| 38 | `create payment-app`, `config init`, the 3 templates | `defaultNetwork: "simulated"`, no `execution` |
| 44 | `artifact verify --strict` of a simulator receipt without `tracePath`; `tx verify` of a simulator plan claiming mainnet | no MISSING_TRACE; no ENV_CONSISTENCY_FAILURE (the plan fails earlier on its hash: the CLI short-circuits simulator plans anyway) |
| 45 | `localnet snapshot create --json` | `hardkasVersion` from a literal in `packages/core/src/snapshot.ts` |
| 35 | `init` package.json | devDependencies `@hardkas/testing, vitest, typescript`: no `@hardkas/cli` |

## The changes

- #40 `packages/cli/src/runners/tx-profile-runner.ts`: `json` → one envelope `{ok, command:"tx profile",
  mode:"cli", result}` (planId, artifactId, networkId, mode, amountSompi, estimatedFeeSompi,
  mass{total, base, inputs, outputs, payload}, structure{inputs, outputs, change}, warnings); no text in
  JSON mode. Text output unchanged.
- #5 `artifact-lineage-runner.ts`: envelope `result{path, schema, lineage|null, orphan, chain, verification,
  warnings}`; violations → the same single envelope with `ok:false, code:"LINEAGE_VIOLATIONS"` and exit 1
  (the top-level handler writes nothing more because the runner already wrote JSON); orphan → `ok:true,
  orphan:true`. Human output now goes through the command output (no `console.log`).
- #39 `commands/deploy.ts`, `runners/deployment-runners.ts`: `deploy track --json` → `{ok, command, mode,
  result: DeploymentRecord}`; `trackDeployment*` return the record; duplicate label is the typed
  `DEPLOYMENT_EXISTS`; help text "Output as JSON" (help-truth pin moved; reference regenerated).
- #19 `commands/tx.ts` (signed-artifact send):
  1. a label that cannot be recorded is refused BEFORE anything is broadcast: not a plain name →
     `DEPLOYMENT_LABEL_INVALID`, exit 2; already recorded on the network → `DEPLOYMENT_EXISTS`, exit 1;
     JSON `{ok:false, outcome:"not_executed", code, message, network, label}`; nothing is sent or written
     (this also satisfies DEPLOYMENT-PATH-CONTAINMENT-1's `tx send --track` case, without a broadcast).
  2. the record is written before anything is printed; the one envelope carries
     `tracking: {requested, label, recorded:true, record}` or `{recorded:false, code, message, retry}`
     and `data.warnings[0] = "DEPLOYMENT_TRACK_FAILED: …"`; human mode prints a WARNING after the
     submission block. DECISION: a record that fails after the broadcast keeps `ok:true` and exit 0 —
     AUX-11 defines submitted = exit 0, and a non-zero exit reads as "not sent" and invites a re-send.
     The reviewer may prefer a non-zero exit; it is one line (`tracking.recorded === false` → throw).
- `replay-verify-runner.ts`: success envelope gains `ok:true, command:"replay verify", mode:"cli"`; the
  existing fields (including `result` = the status string) are kept.
- #37 `packages/config/src/defaults.ts`: the built-in default declares `execution {default:"simulator",
  targets:{simulator, localnet}}`. `defaultNetwork:"simulated"` STAYS as a documented legacy mirror:
  ~30 SDK/CLI paths read `config.defaultNetwork || "simnet"` and the SDK uses that key as its mutable
  active-network slot (`sdk/src/index.ts` open(): `loaded.config.defaultNetwork = options.network`);
  removing the mirror flips those paths to simnet (e.g. `hardkas test` scenarios of every init
  workspace). The full removal is the "SDK ignores execution" (F5) wave. `load.ts`: a user config that
  declares the legacy key and no `execution` gets no built-in execution injected (its resolution and its
  deprecation warning are unchanged).
- #38 templates `payment-app`, `batch-payments`, `local-indexer` (hardkas.config.ts), `config init`,
  `config repair`, `dev init`, the dapp-react template and `docs/guides/real-node-transfer.md` →
  the `execution` contract.
- #44 `packages/tx-builder/src/verify.ts`: ENV_CONSISTENCY_FAILURE for `mode simulator|simulated`
  with a networkId other than `simulated` (legacy artifacts: `simnet`; the valid fixtures are
  `mode: simulator` + `networkId: simnet`); MISSING_TRACE for `mode simulator|simulated` without
  `tracePath` (warning). Note for the reviewer: nothing in the repo calls `verifyTxReceiptSemantics`
  (public API of @hardkas/tx-builder), and `tx verify` short-circuits simulator plans, so neither code
  reaches the CLI today; the function is correct and unit-tested. Not touched: `cli/src/runners/tx-flow.ts`
  `planArtifact.mode !== "simulated"` (always true; AUX-11 passes `yes` explicitly).
- #45 new `packages/core/src/version.ts` (`HARDKAS_RUNTIME_VERSION`, the one literal of core);
  `migrations.ts` exports `CURRENT_RUNTIME_VERSION` from it; `snapshot.ts` uses it.
- #35 `commands/init.ts` devDependencies + `@hardkas/cli` (exact CLI version, like the others); the 3
  workspace templates' package.json + `@hardkas/cli` placeholder (the Builder Lab app templates never run
  the CLI and are left alone).
- Docs: `docs/reference/cli.md` + `cli.generated.json` regenerated (`docs:generate-cli`); the regeneration
  also picked up help text the reference was already behind on (`tx sign --password-env/--password-stdin`,
  `--wait-lock` no-effect texts) and the parallel session's pending localnet texts.

## Tests (new / extended)

- `packages/cli/test/json-papercuts.test.ts` (9, built CLI, simulated workspace): #40, #5 (+ orphan, +
  violations single envelope, + missing file), #39 (+ duplicate, + inspect, + human), #19 refusal before
  broadcast (taken label exit 1, invalid label exit 2, no receipt written), #19 failure after broadcast
  (record directory blocked by a file: `ok:true`, `tracking.recorded:false`, warning, exit 0; human
  WARNING), #19 control (fresh label recorded; human; no `--track` → no block), replay verify `ok`.
- `packages/cli/test/help-truth.test.ts`: `deploy track --json` pinned to "Output as JSON".
- `packages/cli/test/scaffold-versions.test.ts`: init scaffolds `@hardkas/cli`; the workspace templates
  ship it.
- `packages/config/test/papercut-37-default-execution.test.ts` (6): default resolves through the
  simulator target and never warns; no-config and neither-key configs get the default; a legacy config
  keeps its key and is the only one warned; an explicit contract is untouched; mirror = default network.
- `packages/tx-builder/test/verify.test.ts` (+4): ENV_CONSISTENCY_FAILURE on mainnet/testnet/devnet
  claims, none on simulated/simnet, none for rpc/localnet plans; MISSING_TRACE cases.
- `packages/core/test/papercut-45-snapshot-version.test.ts` (2): manifest version = package version =
  runtime constant; no literal left in snapshot.ts.

## Gates run (2026-10-05)

- Unit: config (3 files) + tx-builder verify + core snapshot → 33/33 PASS.
- CLI (built dist): json-papercuts, json-contract, deploy, help-truth, wave8-single-envelope,
  wave2-e-send-outcome, scaffold-versions, wave7-replay-mode-guard, wave5-discovery-delegation,
  deployment-locking, deploy-path-containment → first run 72/74 (the two failures: containment's
  `tx send --track` expected a refusal, templates without `@hardkas/cli` were the Builder Lab apps);
  after the pre-broadcast refusal and the test scoping, the six affected files → 45/45 PASS.
- `pnpm version:check` PASS · `pnpm docs:check-cli` PASS · typecheck core/config/tx-builder/cli clean ·
  eslint on the edited files: 0 errors (pre-existing unused-import warnings only).
- Full suites of core, config and tx-builder (root vitest config): 49 files, 363 passed, 1 skipped.
- Pre-existing, not touched here: `pnpm check:docs` (docs-drift) reports 10 drifts in
  `docs/reference/error-recovery.md` and `errors.md` about commands the surface cut removed
  (`replay receipt.json`, `rpc info|dag|utxos|mempool`, `pskt …`, `simulator silver …`);
  `pnpm docs:check-claims` is stale by one field (`hashVersion` 4 → 5) and is fixed by
  `pnpm docs:generate-claims`. Both were red before this work.

## AFTER (built CLI; `after/*.log`)

`tx profile --json`, `artifact lineage --json`, `deploy track --json` (+ `DEPLOYMENT_EXISTS`),
`tx send --track --json` (taken label → `not_executed` exit 1; fresh label → `tracking.recorded:true`),
`replay verify --json` (`ok:true`) are each exactly one JSON document. `config show --json` without a
config lists `execution`; `create payment-app` / `config init` / the templates declare `execution`; init's
package.json carries `@hardkas/cli`.
