# CLI-RUNTIME-CONTRACT-1 · ledger (2026-10-05)

Isolated worktree `%TEMP%\hk-crc1\wt`, detached at `b926fd75e` (develop; it already contains the
committed JSON-PAPERCUTS / PAPERCUTS-2 work). The main checkout, where Opus works on
EVIDENCE-TRUST-1, was not touched. No commit / push / bump: the owner applies the patch.

## 1 · Inventory (phase 1)

- 53 calls of `handleError` / `handleLockError` in 25 files of `packages/cli/src`. Those that catch,
  render and RETURN (so the run ends with `process.exit(process.exitCode ?? 0)` = 0): `node.ts` ×6
  (start/stop/restart/reset via handleLockError, status/logs via handleError), `l2.ts` ×11, `doctor.ts`,
  `inspect.ts`, `repair.ts`, `rotate.ts`, `status.ts`, `why.ts`, `rpc.ts` (doctor), runners
  `bridge-local` ×3, `metamask` ×3, `kaspa-wallet` ×2, `session` ×4, `local-wizard`, `dev-server`.
  Those that render and then `process.exit(1)` (create, evidence ×3, init, run) or rethrow
  (verify, chaos, test, task) were consistent already.
- 13 wrappers that destroyed the original error: `throw new Error("Command failed")` in
  `accounts-consolidate-runner`, `chaos` (bubble-up), `explain` ×2, `query` (store doctor), `replay`
  (diff), `rpc` (info, health), `test`, `tx` (no args), `why`; `"Bootstrap failed"` in `init` (up);
  `"Dev environment bootstrap failed" / "Dev create failed" / "Dev init failed" / "Dev doctor failed" /
  "Dev last failed"` in `dev.ts`; `task` rethrew a `TASK_FAILED "Command failed"`;
  `chaos` replay rethrew `"Chaos Internal Failure"`.
- Typed-error parser: one, `errorCodeOf` in `ui.ts` (`.code`, else a leading `CODE:`); it did not
  parse the `[CODE]` prefix that `@hardkas/node-runner` uses (`[DOCKER_UNAVAILABLE] …` is a plain
  Error) → `UNKNOWN_ERROR`.
- Exit code: `index.ts` main() → `process.exit(process.exitCode ?? 0)` after a normal parse; on a
  thrown error, its own mapping (HardkasCliError.exitCode / POLICY_DENIED / 1). `process.exitCode`
  was set by nothing but `pskt verify` and F3 batch runners.
- node-runner `DockerKaspadRunner`: `stop()` swallowed every docker error and returned `status()`,
  which also swallowed every docker error as "not-found"; `reset()` removed `.hardkas/kaspad` after
  that; `logs()` wrapped every error into an untyped "Could not get logs…".

## 2 · BEFORE matrix (untouched build of b926fd75e; `before/*.log`, `before/matrix.tsv`)

| scenario | command | typed code at origin | stdout | stderr | JSON | exit | expected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | `node start --json` (Docker unreachable) | `[DOCKER_UNAVAILABLE]` | envelope | – | `ok:false code:UNKNOWN_ERROR` | **0** | ≠0, DOCKER_UNAVAILABLE |
| S1h | `node start` | same | – | error text, UNKNOWN | – | **0** | ≠0 |
| S2 | `node stop` (Docker unreachable) | swallowed | **"✔ Node stopped (Container: …)"** | – | – | **0** | ≠0, no "stopped" |
| S2j | `node stop --json` | swallowed | nothing | "Node stopped" | **none** | **0** | one envelope ≠0 |
| S3 | `node status --json` | swallowed | `docker.available: true, container.exists: false` | – | no `ok` | **0** | ≠0 |
| S4 | `node logs --json` | untyped wrap | envelope | – | `code:UNKNOWN_ERROR` | **0** | ≠0, typed |
| S5 | `node reset --yes --json` (planted `.hardkas/kaspad/marker.txt`) | swallowed | "✔ reset complete" | – | **none** | **0**, **marker deleted** | ≠0, data kept |
| S6 | `node restart --json` | `[DOCKER_UNAVAILABLE]` | envelope | – | `code:UNKNOWN_ERROR` | **0** | ≠0 |
| S7 | `dev init` in an empty dir | `NOT_NODE_PROJECT` | header | **"Dev init failed"** | – | 1 | 1, the real code |
| S8 | `replay diff a b --json` | none (runner message) | envelope | – | **"Command failed"** | 1 | the original message |
| S9 | `why --plan a --signed b` (human) | `LOOKUP_USAGE` | – | usage error + "Command failed" | – | **0** | 2 |
| S10 | `rpc info --url ws://127.0.0.1:1 --json` | none | `ok:false` without code | – | – | 1 | code |
| S11 | `rpc health --json` (no node) | none | health fields without `ok` | – | – | 1 | `ok:false` + code |
| S12 | `lock list --json`, `tx plan --json`, `node status` (Docker reachable), `doctor --json` | – | – | – | – | 0 | 0 (controls) |

Mechanical items (`mech-before/*.log`, main checkout build of the same commit): `accounts balance
alice --json` without `--network` in an init workspace → `UNKNOWN_ERROR: Cannot connect to Kaspa RPC
at ws://127.0.0.1:18210` exit 1 (the option's hardcoded default was `simnet`); `dev tx generate
--count 2 --json` → 2/2 failed `OUTPUT_BELOW_STANDARD_AMOUNT` (0.01-KAS outputs); `dev accounts export
kasware --alias alice` → "Dev account alias 'undefined' not found." **exit 0**; `env check` in a bare
dir → ENV_VALIDATION_FAILED for NETWORK/KASPAD_URL/HARDKAS_DATA_DIR/HARDKAS_KASPAD_IMAGE/LOG_LEVEL;
`node status --json` → `rpc.url: "http://127.0.0.1:18210"`.

## 3 · Root cause

1. The renderer (`handleError` / `handleLockError`) presented an error but did not record it: a
   command that caught, rendered and returned finished "normally" and main() exited with
   `process.exitCode ?? 0`. In JSON mode a swallowed `HardkasCliError` left no envelope at all
   (handleError deferred the envelope to main(), which never saw the error).
2. `errorCodeOf` knew `.code` and `CODE:` but not `[CODE]`, so node-runner's typed messages became
   UNKNOWN_ERROR.
3. Wrappers replaced the thrown error with a new untyped one.
4. node-runner reported what it assumed, not what Docker did.

## 4 · The contract (phase 2)

A) Error before the main operation completed: exit ≠ 0; JSON (if any) never claims success; the
   typed code is preserved; no false success line.
B) Real success: exit 0; no error envelope.
C) Irreversible main operation completed + later auxiliary failure: an explicit partial outcome,
   never "not sent", never an invitation to repeat (tx send --track as fixed by JSON-PAPERCUTS; not
   redesigned here).
D) A typed HardKAS error keeps its code (and allowed context); UNKNOWN_ERROR only when no code
   exists anywhere (not `.code`, not `CODE:`, not `[CODE]`).
E) Human and JSON derive from the same execution truth: one renderer, one exit-code mapping.

## 5 · Implementation (phase 3) — central first

- `packages/cli/src/ui.ts`: `errorCodeOf` parses `[CODE]`; new `exitCodeOf(e)` (own exitCode →
  POLICY_DENIED → 1); new `recordFailure(e)` sets `process.exitCode` once (first nonzero wins);
  render-once marker (a Symbol property on the error) so a command's catch and main() never print
  twice; `handleError` records the failure, writes THE ONE JSON envelope for every error type (typed
  or not) when none was written, then renders the human form (HardkasCliError now also shows its
  `suggestion`); `handleLockError` records too and delegates non-lock errors. The replay divergence
  rendering prints a redacted secret field as such, never `Expected: undefined` (owner's item 5).
- `packages/cli/src/index.ts`: the catch paths call `handleError` and exit with `exitCodeOf(err)`;
  the duplicated envelope/exit mapping is gone.
- `packages/node-runner/src/docker-kaspad-runner.ts`: `nodeRunnerError(code, message)` (a `.code`
  plus the `[CODE]` prefix), `isDockerUnavailableError` / `isNoSuchContainerError`, a `docker()`
  helper that turns an unusable Docker into `DOCKER_UNAVAILABLE`; `status()` throws it (only "no such
  container" is `not-found`); `stop()` asks first, stops only what exists, lets a real `docker stop`
  failure fail, returns `stopped: true|false` (new optional field of `KaspadNodeStatus`); `reset()`
  therefore never removes data when Docker cannot be asked; `logs()` is typed
  (`DOCKER_UNAVAILABLE` / `NODE_CONTAINER_NOT_FOUND` / `NODE_LOGS_FAILED`); `start()` keeps its
  message and gains the code; `rpcUrl` is reported as `ws://` (owner's item 1 / #41).
- `packages/cli/src/commands/node.ts`: `node stop` says "Node stopped" only when `stopped`, else "No
  node container … to stop"; `start/stop/restart/reset --json` print one envelope.
- Wrappers: `dev.ts` (5 commands) and `init up` and `replay diff` let the runner's error through;
  `accounts-consolidate`, `chaos` ×2, `test`, `task` rethrow the original (rendered once);
  `explain`/`why` usage → `HardkasCliError(LOOKUP_USAGE, exit 2)`, `explain` not-found → the
  resolver's code; `query store doctor` → `QUERY_STORE_UNHEALTHY`; `rpc info` → `RPC_INFO_UNAVAILABLE`
  (also in its JSON); `rpc health` → `RPC_NOT_READY` and `ok` in its JSON; `tx send` without
  arguments → `TX_SEND_USAGE` (exit 2).
- Owner's mechanical items: #1 every `127.0.0.1:18210` copy in package sources now comes from
  `nodeRpcUrl()` / `CANONICAL_LOCALNET` (config defaults + provider, kaspa-rpc health + json client
  default (was http://), sdk, dev-server escrow route, cli up/doctor-node/rpc-doctor/rpc-health/init
  template/help texts) and a test forbids new copies; #2 was closed by PAPERCUTS #45; #3
  `accounts balance` has no hardcoded `simnet` default: without `--network` the workspace's resolved
  target decides (`resolveNewIntentTarget`), simulator fallback; #4 SDK `localnet.stop()` on the
  simulated profile answers `SIMULATED_LOCALNET_NO_PROCESS` ("Nothing was stopped…"); #5 see ui.ts;
  #6 `examples/04-trace-and-replay/hardkas.config.ts` → execution contract; #7 `tx-flow.ts` guard
  compares `mode !== "simulator"` (every CLI caller passes `yes`, so no visible change); #8
  `dev accounts export <format>` really parses `kasware` and `--alias` (the old `"export kasware"`
  took the literal as its options → alias `undefined`) and refusals are typed failures
  (DEV_EXPORT_FORMAT_UNKNOWN / DEV_ACCOUNT_NOT_FOUND exit 2, DEV_EXPORT_INCOMPATIBLE /
  DEV_EXPORT_NOT_ALLOWED exit 3); #9 `dev tx generate` sends whole-KAS amounts (1.0–1.9 KAS); #10
  `env check` no longer demands the `deploy init` profile: it lists the HARDKAS_* variables HardKAS
  reads (process + .env), reports the deployment profile only when a .env declares it, and fails
  (ENV_UNKNOWN_VARIABLE, exit 2) only for a HARDKAS_* name it does not know; it has `--json`.

## 6 · AFTER matrix (final build; `after/*.log`, `after/matrix.tsv`, `mech-after/*.log`)

| scenario | exit | JSON | note |
| --- | --- | --- | --- |
| S1 node start (--json / human) | 1 / 1 | `ok:false code:DOCKER_UNAVAILABLE` | human: `[DOCKER_UNAVAILABLE] …`, no UNKNOWN_ERROR |
| S2 node stop (human / --json) | 1 / 1 | `code:DOCKER_UNAVAILABLE` | no "Node stopped" |
| S3 node status (--json / human) | 1 / 1 | `code:DOCKER_UNAVAILABLE` | no `docker.available: true` |
| S4 node logs --json | 1 | `code:DOCKER_UNAVAILABLE` | |
| S5 node reset --yes --json | 1 | `code:DOCKER_UNAVAILABLE` | **marker kept** |
| S6 node restart --json | 1 | `code:DOCKER_UNAVAILABLE` | |
| S7 dev init (empty dir) | 1 | – | `✗ [NOT_NODE_PROJECT] No package.json found…` |
| S8 replay diff --json | 1 | `code:UNKNOWN_ERROR`, message = the runner's own ("Could not read replay artifact A …") | the runner throws a plain Error without code: UNKNOWN_ERROR is now true (D) |
| S9 why --json / explain human | 2 / 2 | `code:LOOKUP_USAGE` | |
| S10 rpc info --json | 1 | `ok:false code:RPC_INFO_UNAVAILABLE` | |
| S11 rpc health --json | 1 | `ok:false code:RPC_NOT_READY` + health fields | |
| S12 controls | 0 | `ok:true` / unchanged | |
| mech #3 accounts balance alice --json | 0 | `network: simulated`, 1000 KAS | |
| mech #9 dev tx generate --count 2 --json | 0 | `ok:true successCount:2` | |
| mech #8 export --alias alice / nobody | 2 / 2 | – | `DEV_ACCOUNT_NOT_FOUND` + suggestion (no dev accounts exist in a fresh init workspace) |
| mech #10 env check bare / typo | 0 / 2 | – | `ENV_UNKNOWN_VARIABLE` for `HARDKAS_HOEM` |
| mech #41 node status --json | 0 | `rpc.url: ws://127.0.0.1:18210` | |

## 7 · Tests and gates

New / extended: `packages/cli/test/cli-runtime-contract.test.ts` (18: errorCodeOf, exitCodeOf,
recordFailure, render once, one envelope for a swallowed typed error, lock error, secret divergence;
e2e node stop/start/restart/status/logs/reset with DOCKER_HOST=tcp://127.0.0.1:1, dev init, why/explain
usage, rpc info, replay diff, success control); `packages/node-runner/test/docker-kaspad-runner.test.ts`
(+7: stop/status/logs/reset/start with Docker down or no container); `error-code-prefix.test.ts`
(resets process.exitCode); `rpc-commands.test.ts` (typed RPC_INFO_UNAVAILABLE instead of "Command
failed"); `packages/cli/test/mechanical-papercuts-2026-10-05.test.ts` (6: #3, #9, #8, #10 unit + e2e);
`packages/sdk/test/localnet-stop-simulated-noop.test.ts` (#4); `packages/core/test/canonical-rpc-url-literals.test.ts` (#1 guard).

Runs (worktree build): targeted contract + related suites 149/151 → the two failures were the test
assumptions (explain has no --json; rpc-commands pinned "Command failed"), fixed → mechanical + contract
+ related 37 files, 234/234 PASS. Builds: config, kaspa-rpc, node-runner, sdk, dev-server, cli green;
typecheck of those six clean; eslint of every edited file 0 errors; `docs:generate-cli` +
`docs:check-cli` PASS (accounts balance --network, env check, dev accounts export help texts);
`version:check` PASS.

Full hermetic gate (`node scripts/gate-hermetic.mjs --home %USERPROFILE%\.hardkas`, DOCKER_HOST
unreachable, no non-loopback network): run 1 → 406 files, 2390 passed, 1 failed, 28 skipped, 0
non-loopback attempts, 988 s. The one failure was this work's own `env check` e2e test: the gate
exports `HARDKAS_HERMETIC_LOG`, which the known-variable list did not include, so `env check` flagged
the gate's own variable. Fixed by listing the three hermetic-gate variables (`HARDKAS_HERMETIC_LOG`,
`HARDKAS_HERMETIC_DENY_PORTS`, `HARDKAS_HERMETIC_TRACE`); run 2 → 406 files: 399 passed, 7 skipped;
2391 tests passed, 0 failed, 28 skipped; 0 non-loopback attempts; vitest exit 0 after 1000 s.

## 8 · Errors found and left out (own waves)

- `tx-flow.ts`: `dev tx send` forces `simnet` and never passes `yes`, so it is always "blocked" on a
  real node; untouched (AUX-11 territory).
- `rpc dag/utxos/mempool --json` print no `ok` (success shape only); `node status --json` has a
  schema but no `ok`; `doctor --json` exit semantics (doctor exit 0 with failed checks) untouched.
- `localnet` commands keep their own `{ok:false, error:{code}}` envelope shape (different from the
  CLI's `{ok:false, code}`); not unified here.
- `UI.error(...) + return` outside catch blocks in runners (`verifyDeploymentStatus` "RPC check
  failed", `dev tx send` usage) still exit 0; only `dev accounts export` was converted (owner's item 8).
- `l2.ts` ×11 and the metamask/session/kaspa-wallet/bridge runners now exit nonzero through the
  central fix; their messages were not revisited.

## 8b · Contract decisions recorded (reviewer, 2026-10-05)

- ENV-CHECK-UNKNOWN-1: `env check` fails (ENV_UNKNOWN_VARIABLE, exit 2) for any `HARDKAS_*` name
  outside `HARDKAS_ENV_VARIABLES` (`packages/cli/src/commands/env.ts`), except the `HARDKAS_TEST_*`,
  `HARDKAS_HARNESS_*`, `HARDKAS_ESCROW_*` and `HARDKAS_DEV_SERVER_*` prefixes. Consequence: every
  new variable HardKAS starts reading must be added to that list, or `env check` will flag it; the
  hermetic gate found exactly such an omission (`HARDKAS_HERMETIC_LOG`) on its first run. Accepted as
  a deliberate contract; revisit if it proves brittle.

## 8c · Findings registered, not fixed here (reviewer's names)

- DEV-TX-SEND-NETWORK-1: `dev tx send` forces `simnet` and never passes `yes`, so its flow is always
  "blocked" (`packages/cli/src/runners/dev-tx-runners.ts`).
- JSON-ENVELOPE-RESIDUAL-1: `rpc dag/utxos/mempool --json` (success shape only) and
  `node status --json` (schema, no `ok`) carry no `ok`.
- DOCTOR-EXIT-CONTRACT-1: `doctor` exits 0 with failed checks (verdict semantics untouched here).
- LOCALNET-JSON-ENVELOPE-1: the `localnet` commands keep their own `{ok:false, error:{code}}`
  envelope, different from the CLI's `{ok:false, code}`.
- CLI-RETURN-SWALLOW-1: `UI.error(...) + return` outside catch blocks still ends with exit 0
  (`deploy status --verify` "RPC check failed", `dev tx send` usage, …): CLI-RUNTIME fixed the
  catches, it does not yet prove that every error the CLI shows implies a failure state.

## 8d · Integration checks (reviewer's two questions, verified on the patch manifest)

- `packages/core/src/index.ts` is NOT in the patch: under `packages/core` the manifest lists only
  `packages/core/test/canonical-rpc-url-literals.test.ts`; nothing under `packages/artifacts` or
  `packages/localnet`.
- `secret: true` is read in exactly one place, `ui.ts` lines 291–294, inside the human (stderr)
  rendering of a REPLAY_DIVERGED report; it is not consulted for equality, for the exit code
  (`recordFailure` runs before and depends only on the error) nor for the JSON envelope (written
  before that branch). raw decides → evidence-safe persistence → UI presents.

## 9 · Overlaps with Opus (EVIDENCE-TRUST-1)

None by file: Opus edits `packages/artifacts/src/diff.ts`, `schemas.ts`, `core/src/security.ts`,
`core/src/index.ts`, `localnet/src/replay.ts|types.ts`. This work touches none of them. The only
semantic touch point is the human rendering of a redacted divergence (`div.secret === true`) in
`ui.ts`, which only reads the structure `diffArtifacts` already defines.
