# CLI-CONTRACT-2 · investigation + BEFORE (2026-10-10)

**Base:** develop **`3c61d15f6`** (WORKSPACE-AUTHORITY-2 published; tree `1136a842`). **Where:** the isolated worktree
`%TEMP%\hk-ra\wt`, detached at that commit, clean; its `dist` is the build of this exact source (the WA-2 closeout build,
tree-identical). **What changed in the repo:** nothing in the product. One new test file
(`packages/cli/test/cli-contract-2.test.ts`) and this evidence folder. No commit, push, version, full gate or demo
localnet. **Mandate (reviewer, 10-oct):** investigate the original TEST-VACUOUS-PASS finding and reproduce it against the
current code; distinguish (1) tests that pass without verifying a real effect, (2) commands that return success without
fulfilling their contract, (3) CLI errors that appear as `UNKNOWN` instead of a typed code, (4) differences between
simulated results, real RPC and the output's claims; deliver BEFORE reproductions, green controls, paths and root cause,
separating live defects from historical findings already fixed; STOP before any fix.

## 0 · Method

- **Hermetic, as the gate.** Every CLI run is a real process on the built `packages/cli/dist/index.js`, in its own temp
  workspace, with a private copy of the gate's `HARDKAS_HOME`, Docker unreachable (`DOCKER_HOST=tcp://127.0.0.1:1`),
  no network beyond loopback (the preload refuses it) and the localnet ports refused even on loopback. Nothing ran
  against a node; the canonical demo localnet was never touched; `C:\.hardkas` never existed.
- **Three sources of evidence.** (a) The BEFORE file, 28 cases in five families, run once under the hermetic runner
  (`cc2-before-1`): a red case is a live defect, a green one a control or a historical finding already fixed; the file
  is kept exactly as run. (b) The mini re-audit's own batteries, unchanged, re-run on this HEAD: `test-2` (the `hardkas
  test` verdicts) and `sweep-2` (the runtime contract over the 164 leaf commands of the 6-oct help tree, bogus inputs, an
  empty directory and a used workspace — the updated reproduction of the 6-oct numbers). (c) The code, read at this
  HEAD, for every root cause; and the full gate's own JSON report of WA-2 (`wa2-gate-1`, 2901 tests) for the corpus
  question of §4.
- **Where the findings come from.** MINI-REAUDIT-1 (6-oct, on `cfd4a7c99`): 🟠8 TEST-VACUOUS-PASS and the 🟡 "CLI
  contract residue" family (51 untyped failures in 26 commands, 45 `--json` runs without a document, 4 errors with exit
  0, 4 runs with two documents, three codes for one unreachable node, `--amount ""`, `ci verify` without Docker,
  `status` with a broken config). CLI-RUNTIME-CONTRACT-1's ledger (5-oct, §8c): DEV-TX-SEND-NETWORK-1,
  JSON-ENVELOPE-RESIDUAL-1, DOCTOR-EXIT-CONTRACT-1, LOCALNET-JSON-ENVELOPE-1, CLI-RETURN-SWALLOW-1. WA-2 §8.5: the `tx
  plan` connection failure reported as `UNKNOWN`.

## 1 · The runs (every run kept: `before/logs`, `before/probes`)

| Run | What | Result |
| --- | --- | --- |
| `test-2` | the 6-oct battery `adv-test.mjs`, unchanged, on `3c61d15f6` (4 probes) | TEST-NO-TESTS: **`ok:true, passed:true, scenariosExecuted:0` and exit 1** — the orange 8, verbatim, on the new HEAD (the probe's automatic verdict still says OK, as on 6-oct; the evidence decides). TEST-FAILING ok:false / exit 1. TEST-INIT-SCAFFOLD: a fresh `init` without installed dependencies refuses with `VITEST_MISSING` (honest, as on 6-oct). 0 non-loopback |
| `cc2-before-1` | `packages/cli/test/cli-contract-2.test.ts`, 28 cases, hermetic runner | **4 green / 24 red** in 45 s; 0 non-loopback; loopback `127.0.0.1:18210` ×7 (the node-bound cases, refused) and `localhost:7420` ×1 (`status` probing the dev server). vitest exit 1, as a BEFORE should |
| `manual-A4` | one manual run of `hardkas test --json --scenario ZZZ_NO_SUCH_TEST` with a passing test present | vitest skips the test (`numPendingTests: 1`), the CLI answers `ok:false, passed:false`, exit 1, no code — the same false failure as A3 (§3.3); A4's green is accidental (§3.4) |
| `sweep-2` | the 6-oct battery `adv-sweep.mjs`, unchanged, over the 164 leaf commands (328 runs, 580 s; the used workspace's own payment plan/sign/send 0/0/0) | **6-oct → today:** `EXIT0_ON_ERROR` 4 → **4** (the same two commands in both places: `create <unknown template> --json`, `dev tx send`); `UNTYPED` 51 → **51**, the same 26 commands (39 runs answer `UNKNOWN_ERROR`, 12 answer `ok:false` with **no code at all** — `corpus verify`, `programmability corpus verify`, `vprogs inspect`, `zk corpus verify`, `zk proof inspect/verify`); `JSON_MISSING` 45 → **44** (the one gone is `node reset --json`, fixed; the 44 left are commander usage errors of 22 commands, printed as text); `JSON_MULTI` 4 → **4** (`run`, `kaspa doctor`); `NATIVE_CRASH` 1 → **0** (the `verify` libuv crash, closed by VERIFY-EXIT-CRASH); `HANG` 2 → 2 (`tx wait`, its own 60 s default = the sweep's); `CRASH` 0, `STRAY_WRITE` 0; 33 loopback refusals, 0 non-loopback |

## 2 · Headline

1. **TEST-VACUOUS-PASS reproduces unchanged on `3c61d15f6`**, and it is one of six defects of the same verdict (§3): a
   pass with nothing run; two JSON documents on stdout; a report that cannot say how many tests ran; a run with no
   failure reported as a failure; the failure code that never reaches the JSON envelope; a network the tests did not
   run in.
2. **One unreachable node still gets three codes** — `UNKNOWN`, `UNKNOWN_ERROR`, `RPC_NOT_READY` — for one message
   (§5). The classifier looks for `ECONNREFUSED` in a text that says "Unable to connect".
3. **`dev tx send` prints "Transaction submitted." and exits 0 with no receipt written** (§6.2): a success claim with no
   effect behind it. Its usage error exits 0 too (§6.1). `create <unknown template> --json` answers `ok:false` with exit
   0 (§6.3). `status` describes a workspace whose config cannot load as healthy, and calls a directory holding a
   `hardkas.config.ts` "no workspace" (§6.4). `ci verify` blames the workspace when only Docker is down (§6.5). `doctor`
   reports a failed check and exits 0 (§6.6, a decision). A re-sent simulated transaction is answered `outcome:
   "submitted"` although the SDK said `submitted: false` (§6.7).
4. **Under `--json`, commander's usage errors print text, exit 1 (not the usage code 2) and terminate the process
   abruptly; `run` and `kaspa doctor` print two documents** (§7).
5. **`tx plan --amount ""` plans 1 KAS, `--to ""` pays bob, `--from ""` spends alice** (§8).
6. **The repository's own corpus holds three literally vacuous tests and one tautology** (§4); the 28 skipped tests of
   the gate are all labelled and honest.
7. Historical findings now fixed, proven green here: `node reset --json` without `--yes` (typed usage refusal, one
   envelope), `--network <unknown>` typed before any connection (WA-2), `rpc health` typed (§9); and, from the sweep,
   the `verify` native crash is gone. **Everything else in the 6-oct "CLI contract residue" is still there, number for
   number** (`sweep-2`, §1): 51 untyped failures in the same 26 commands, 44 usage errors without an envelope, 4 errors
   with exit 0, 4 double documents.

## 3 · TEST-VACUOUS-PASS and the `hardkas test` verdict (family A)

Code: `packages/cli/src/runners/test-runner.ts`; the command `packages/cli/src/commands/test.ts`.

### 3.1 · A1 · no test file → `ok:true`, exit 1 (the orange 8, live)

`hardkas test --json` in a workspace with no test file prints the envelope `ok: true, result.passed: true,
scenariosExecuted: 0` while vitest prints "No test files found, exiting with code 1" on stderr and the process exits 1.
Machine readers and CI disagree, exactly as on 6-oct.

- **Root cause.** `test-runner.ts:96-97`: `passed = filesState.every(f => f.result?.state === "pass")` — `every` over
  an empty list is `true`. The exit code 1 is vitest's own (`startVitest` sets `process.exitCode = 1` when it finds no
  test files; `passWithNoTests` is off), kept by `main()` (`index.ts:43`, `process.exitCode ?? 0`). The CLI never
  reads vitest's counts; it reads only the per-file states.

### 3.2 · A2a / A2b · one passing test → two JSON documents, and a report that says nothing ran (live)

`hardkas test --json` with one passing test prints **two** JSON documents on stdout: vitest's own JSON report
(`{"numTotalTestSuites":1,…,"numPassedTests":1,…}`) and then the envelope. And the envelope says `scenariosExecuted: 0,
passed: true` — the same words as A1. A reader of the envelope alone cannot tell one passing test from none.

- **Root cause.** `test-runner.ts:70`: in `--json` mode the runner hands vitest `reporter: "json"` with no
  `outputFile`, so vitest's JSON reporter writes to stdout. `test-runner.ts:114-121`: the report carries
  `scenariosExecuted` (the number of scenario-result files the HardKAS test helpers wrote under
  `.hardkas/runs/<id>/scenario-results`) and `passed`, never vitest's `numTotalTests / numPassedTests / numFailedTests
  / numPendingTests`, which the runner has in hand (`vitest.state`).

### 3.3 · A3 · a file whose only test is skipped → "failed" (live)

With one `test.skip(...)` and nothing else, vitest reports `numPendingTests: 1, success: true`; the CLI answers
`ok: false, passed: false`, exit 1. Nothing failed, and the run is reported as a failure.

- **Root cause.** `test-runner.ts:97` again: a file whose tests are all skipped has `result.state === "skip"`, not
  `"pass"`, so `every(... === "pass")` is false; `:156-163` then throws `TESTS_FAILED` ("One or more scenarios
  failed."). The same happens to a `--scenario` pattern that selects nothing (`manual-A4`).

### 3.4 · A4 · `--scenario` matching nothing: green by accident

A4 asked three things of that run: envelope and exit agree, no pass with nothing run, no `TESTS_FAILED`. All three held
— because the run is the false failure of §3.3 (`ok:false`, exit 1) **and** the code never reaches the envelope (§3.5),
so `codeOf()` found none. The behaviour is the defect of §3.3; the assertion did not see it. Kept as run, documented
here, not re-written.

### 3.5 · A5 · the failing test (control) · `ok:false`, exit 1 hold; `TESTS_FAILED` never reaches the JSON (live)

A failing test is reported `ok: false`, exit 1 — the control holds. The case is red because the envelope has no `code`.

- **Root cause.** `test-runner.ts:146-153` writes the envelope (`ok: passed`, no code) **before** `:156-163` throws
  `TESTS_FAILED`; the renderer then finds `jsonWritten` already set (`ui.ts:272`) and writes nothing: in `--json`, the
  typed code of a test failure is invisible. The human path shows it.

### 3.6 · A6 · the report names a world the tests did not run in (live, category 4)

In a workspace whose execution target is the simulator, the envelope says `network: "simnet"`.

- **Root cause.** `commands/test.ts:9`: `--network` defaults to `"simnet"` and is documented as "Only recorded in the
  results: tests use the config's default network"; `test-runner.ts:77,116` records that option value (and exports it
  as `HARDKAS_NETWORK` to the tests) without resolving the workspace's execution. The claim and the execution come from
  different places.

### 3.7 · What the verdict needs (for the decision, not done here)

A pass that proves something ran (vitest's counts in the envelope; zero tests → not a pass, a typed `NO_TESTS_FOUND`),
one document on stdout (vitest's JSON to a file or off), a failure only when something failed (skipped ≠ failed), the
code inside the envelope (compute the verdict, then write once), the resolved execution network in the report.

## 4 · The corpus: tests that pass without verifying anything

The question "can a test be green without proving the command did what it promised" also applies to HardKAS's own
suites. Evidence from the WA-2 full gate's JSON report (`wa2-gate-1`, 1198 files, 2901 tests, 28 skipped) and a static
pass over `packages/*/test/**/*.test.ts` (480 files with `it()`/`test()` calls; 2790 test calls; 7811 assertion calls).

- **Literally vacuous (always green, assert nothing):**
  - `packages/testing/test/gauntlet.test.ts` — `it("stub", () => {})` under "legacy vitest stub": one green test with
    an empty body.
  - `packages/core/test/fault-injection.test.ts:19-24` ("Missing canonical artifact raises error during projection")
    and `:44-55` ("Permission denied (EACCES) is fatal and fails fast") — bodies that end in `expect(true).toBe(true)`
    with a comment calling them placeholders. Two green tests that claim two runtime-contract properties and verify
    neither.
- **Tautological (cannot fail unless the opposite of its name happens):**
  - `packages/kaspa-rpc/test/wrpc-client.test.ts:26-38` ("ping returns false when no server is running"): a `try` that
    expects `false` and a `catch` that asserts `expect(true).toBe(true)`; a thrown connection error and a `false` both
    pass, a `true` would too if `ping` threw afterwards. It pins nothing about the no-server case.
- **Files with tests and no assertion call (3):** `cli/test/tx-simulated.test.ts` (asserts by throwing — not vacuous),
  `testing/test/gauntlet.test.ts` (the stub above), `testing/test/mining-driver.simnet.test.ts` (asserts by throwing
  inside `runRegression`; needs a real simnet node).
- **The 28 skipped tests of the gate are honest:** every one is labelled in its title — `[known gap: … -> <owner
  wave>]` (16: workflow-corpus ×5, fees ×2, simulated-isolation, tx-simulated, smoke, localnet-fund-race,
  evm-rpc-client, audit-hardening, integration, multisig-adversarial), `[conditional integration]` (11, the dev-server
  escrow matrices gated by an `INTEGRATION` flag) and one platform skip (`toolchains` mode 0755 on win32). None hides a
  failure as a pass; they are counted as pending, not passed.
- **Empty `catch {}` blocks inside tests:** 29 in 20 files; read as cleanup guards (`rmSync` in `afterEach`, probes of
  optional state), none wrapping an assertion. Not a defect; listed so the sweep is complete.

Verdict: the corpus-level vacuity is small and concrete (3 vacuous tests + 1 tautology out of 2901); the product-level
vacuity is the `hardkas test` verdict of §3, which is what the orange named.

## 5 · One unreachable node, three codes (family B)

In a workspace whose default target is the localnet node (refused by the hermetic run), the same failure — kaspa-wasm's
"Cannot connect to Kaspa RPC at ws://127.0.0.1:18210 … (wRPC -> WebSocket -> Unable to connect …)" — is reported:

| Command | Code | Message |
| --- | --- | --- |
| `tx plan --json` (B1, red) | **`UNKNOWN`** | "Unknown connection error: Cannot connect to Kaspa RPC at …" |
| `accounts balance alice --json` (B2, red) | **`UNKNOWN_ERROR`** | the raw message |
| `rpc health --json` (B3, green control) | `RPC_NOT_READY` | its own |

B4 (red) pins the disagreement: three codes for one condition. B0 (green control): a refusal that needs no connection,
`--network nonsense`, is `UNKNOWN_NETWORK` in one envelope, exit 1 (WA-2).

- **Root cause, `tx plan`.** `packages/cli/src/cli-errors.ts:142-161` `classifyRpcError` matches `ECONNREFUSED`,
  `ETIMEDOUT`/`timeout`, `ENOTFOUND`, TLS strings and "request deserialization error", else `"UNKNOWN"`; the wasm
  client's text has none of them. `tx-plan-runner.ts:386-404` wraps the error in the CLI's `RpcConnectionError` with
  `errorCode: "UNKNOWN"` → a `HardkasCliError` whose code is literally `UNKNOWN` and whose message starts "Unknown
  connection error".
- **Root cause, `accounts balance`.** No classification at all on that path (`accounts-balance-runner.ts`): the
  kaspa-rpc `RpcConnectionError` thrown by `packages/kaspa-rpc/src/upstream/session.ts:145` carries no `code`
  (`packages/kaspa-rpc/src/errors.ts:68-73`, `code?` optional and not passed), its message has no `CODE:` or `[CODE]`
  prefix, so `errorCodeOf` (`ui.ts:209-218`) yields `UNKNOWN_ERROR`.
- **The text the classifier misses is already known upstream:** `session.ts:72` defines `NOT_CONNECTED = /WebSocket is
  not connected|Unable to connect|not connected/i` for its own reconnection logic; the CLI classifier does not use it.
- **Sweep context (6-oct):** 51 untyped failures across 26 commands, mostly correct refusals without a code
  (`UNKNOWN_ERROR` on missing inputs, unknown names, corrupt artifacts). `sweep-2` gives the updated list (§1).

## 6 · Errors shown with exit 0, and claims without an effect (family C)

The CLI-RUNTIME-CONTRACT-1 rule: a rendered error is a failure of the run (`handleError` → `recordFailure`,
`ui.ts:234-238`). `UI.error` (`ui.ts:92-101`) is presentation only: it writes the red "✗ Error:" block and records
nothing. Every `UI.error(...) + return` outside a catch therefore ends with exit 0 (CLI-RETURN-SWALLOW-1, registered
5-oct). The static sweep finds exactly one such site left in `packages/cli/src` (`dev-tx-runners.ts:18-21`), plus the
explicit paths below.

### 6.1 · C1 · `dev tx send` without arguments: "✗ Error: Missing required arguments…" and exit 0 (live)

`dev-tx-runners.ts:17-22`: `UI.error(...)` then `return`. The command's catch never sees it.

### 6.2 · C2 · `dev tx send --from alice --to bob --amount 1`: "Transaction submitted.", exit 0, no receipt (live)

In the simulator workspace the command prints:

```
Transaction submitted.

Artifacts:
  plan_plan-a99...
  signed_signed-4...

  💡 Next Steps:
     > hardkas why unknown
```

No `receipt_…` line, no receipt file under `.hardkas/artifacts`, `hardkas why unknown` as the next step, exit 0. A plan
and a signature exist; nothing was sent; the output says it was.

- **Root cause.** `dev-tx-runners.ts:55-62` prints "Transaction submitted." unconditionally after `runTxFlow`, and the
  receipt line only `if (sendResult?.artifact?.txId)`; the flow is called with `send: true` but never with the flow's
  consent (`yes`), so its send step is refused and the function returns a result whose `steps.send` has no artifact
  (DEV-TX-SEND-NETWORK-1 said "always blocked"; this is what "blocked" looks like to the user). The artifactId falls to
  the literal `"unknown"` (`:39-42`). The `const network = "simnet"` of `:15` ("force simnet for dev tx send") is dead:
  it is never passed to the flow, which is why the command stayed in the simulator and did not reach the node — the
  comment describes an intent the code does not have.

### 6.3 · C3 · `create <unknown template> <dest> --json`: `ok:false`, exit 0, a foreign envelope (live)

Prints `{ "ok": false, "error": { "code": "TEMPLATE_CREATE_FAILED", "message": "Template 'no-such-template' not
found." } }` and exits 0.

- **Root cause.** `commands/create.ts:95-108`: in `--json` the catch writes its own nested envelope (`error.code`, not
  the CLI's top-level `code`) and records no failure; in human mode it calls `handleError` and then `process.exit(1)` —
  the right exit, by the abrupt termination R0-I1 forbids (`index.ts:36-38`).

### 6.4 · C4 / C4b · `status` never loads the config (live)

- C4: with a `hardkas.config.ts` that cannot load (`throw new Error(...)`) and a `.hardkas/` present, `status` prints the
  normal workspace box, "Dev Server Offline", "Artifacts 0", "No Dev Accounts found", exit 0. The broken config is not
  mentioned.
- C4b: with a valid `hardkas.config.ts` and no `.hardkas/`, `status` says "No HardKAS workspace detected in current
  directory." and suggests `hardkas init`, exit 0 — while WORKSPACE-AUTHORITY-1 defines the root as "the nearest
  `hardkas.config.*` at or above this directory" (`program.ts:81-84`).
- **Root cause.** `commands/status.ts:25-31`: `hasWorkspace = fs.existsSync(<root>/.hardkas)`; the config is never
  loaded (`loadHardkasConfig` is not called anywhere in the command), so neither its presence nor its failure is seen.

### 6.5 · C5 · `ci verify` with Docker down: "Workspace is corrupted or incorrectly configured" (live)

In a pristine simulator workspace with Docker unreachable: step 1 "Environment doctor checks failed.", steps 2–3
warnings only, then `[CI_VERIFY_FAILED] CI Verification Failed. Workspace is corrupted or incorrectly configured.`

- **Root cause.** `commands/ci.ts:29-42` folds every doctor failure into `hasErrors` without saying which check failed;
  `:81-87` throws one fixed message for any `hasErrors`. The failed check is the Docker daemon (§6.6), an environment
  fact, not a property of the workspace; the verdict names the wrong thing (`hist-r2` E9b on 6-oct, unchanged).

### 6.6 · C6 · `doctor --json`: one failed check, exit 0 (live; a decision)

The JSON report lists the Docker daemon check as failed (`summary.failed: 1`) and the process exits 0.

- **Root cause.** `commands/doctor.ts:716-725`: the exit code follows `report.summary.failed` only under `opts.strict`,
  and the registered command (`:20-24`) exposes `--json` and no `--strict`; the boolean the function returns is used by
  `ci verify` (§6.5) and discarded by `doctor` itself. DOCTOR-EXIT-CONTRACT-1 (5-oct) left this as "verdict semantics
  untouched"; it is a product decision (does a doctor that found a failure exit 0?), recorded here with its evidence.

### 6.7 · C7 · re-sending an applied simulated transaction: `outcome: "submitted"` again (live, category 4)

plan → sign → send (receipt written, 1) → send the same signed artifact again: `ok: true, outcome: "submitted"`, the
same receipt, no new file, no word about idempotence.

- **Root cause.** The SDK is honest: `packages/sdk/src/tx.ts:1664-1681` catches the simulator's "invalid simulated
  input" (inputs already spent), finds the existing verified receipt and returns `{ submitted: false, receipt:
  existing, … }`. The CLI's label discards it: `runners/next-steps.ts:88-89` (`sendOutcomeLabel`) and `:121-123`
  (`outcomeOfEffect`) map any accepted/executed receipt to `"submitted"`; `submitted: false` is never consulted. The
  mini re-audit's "no 'already applied' marker" is this mapping.

## 7 · `--json` answers with one envelope, usage errors included (family D)

| Case | Today | Root cause |
| --- | --- | --- |
| D1 `tx plan --no-such-option --json` (red) | stderr "error: unknown option …" + the full help; **no JSON document**; **exit 1** | commander's defaults: `program.ts:69-77` sets `showHelpAfterError`, `showSuggestionAfterError`, `allowExcessArguments(false)` and no `exitOverride()` / `configureOutput()`, so commander prints text and calls `process.exit(1)` itself — before any HardKAS renderer runs; the usage exit code of the contract is 2 (`HardkasExitCode.USAGE_ERROR`, `cli-errors.ts:16`) and the termination is the abrupt kind R0-I1 forbids |
| D2 `artifact verify --json` (missing `<path>`) (red) | the same: text, no document, exit 1 | the same |
| D3 `run <missing> --json` (red) | **two documents**: `{"timestamp":…,"level":"info","event":"Running script: …"}` then `{ ok:false, code:"SCRIPT_NOT_FOUND" }` | `commands/run.ts:34-35`: `logger.info(...)` of `@hardkas/observability` writes a JSON log line to stdout; then `:45` `process.exit(1)` after `handleError` (abrupt again) |
| D4 `kaspa doctor --json` (red) | **two documents**: `{ schema: "hardkas.kaspaDoctor.v1", status: "failed", checks: [...] }` then `{ ok:false, code:"DOCTOR_FAILED" }` | `runners/kaspa-doctor-runner.ts:106-116`: `console.log(JSON.stringify(result))` prints the schema document (outside the output layer, so `jsonWritten` stays false), then a `DOCTOR_FAILED` `HardkasCliError` is thrown and the renderer writes a second envelope; the result document and the failure envelope are never one |
| D5 `node reset --json` without `--yes` (green control) | `{ ok:false, code:"INTERACTIVE_PROMPT_IN_JSON_MODE" }`, exit 2, one document | fixed by JSON-ENVELOPE-RESIDUAL-2 (`commands/node.ts:155-164`) |

Registered on 5-oct and **not re-run here** because they need a reachable node or Docker: `rpc dag/utxos/mempool --json`
(success shape without `ok`) and `node status --json` (schema, no `ok`) — JSON-ENVELOPE-RESIDUAL-1; the `localnet`
commands' own `{ ok:false, error:{ code } }` shape — LOCALNET-JSON-ENVELOPE-1 (the same nested shape `create` uses in
§6.3). Code identity: those files are unchanged since.

## 8 · An explicit empty input is replaced by a default (family E, live)

`tx plan --from alice --to bob --amount "" --json` plans **1 KAS** (`amountSompi: 100000000`); `--to ""` plans to
**bob**; `--from ""` spends **alice**. Exit 0, a full plan artifact each time.

- **Root cause.** `commands/tx.ts:221-223`: `from: options.from || positionalFrom || "alice"`, `to: options.to ||
  positionalTo || "bob"`, `amount: options.amount || "1"` — `||` treats the empty string as absent. The SDK would refuse
  an empty amount (untyped); the CLI never shows it one.

## 9 · Live defects and historical findings

| Finding (origin) | On `3c61d15f6` | Case |
| --- | --- | --- |
| TEST-VACUOUS-PASS, `ok:true` + exit 1 with no tests (6-oct 🟠8) | **live** | A1, `test-2` |
| `test --json` two documents; no counts; skipped = failed; code lost; wrong network (new here) | **live** | A2a, A2b, A3, A5, A6 |
| `tx plan` → `UNKNOWN` (6-oct 🟡; WA-2 §8.5) | **live** | B1 |
| `accounts balance` → `UNKNOWN_ERROR` (6-oct 🟡) | **live** | B2 |
| three codes for one unreachable node (6-oct 🟡) | **live** | B4 |
| `dev tx send` usage error exit 0 (CLI-RETURN-SWALLOW-1, 5-oct; 6-oct sweep) | **live** | C1 |
| `dev tx send` "Transaction submitted." without a send (DEV-TX-SEND-NETWORK-1, 5-oct — now seen as a false success) | **live** | C2 |
| `create <unknown template> --json` exit 0 (6-oct sweep) | **live** (and a foreign envelope shape) | C3 |
| `status` with a broken config (6-oct 🟡) | **live** (and the config-only root) | C4, C4b |
| `ci verify` without Docker (6-oct 🟡, `hist-r2` E9b) | **live** | C5 |
| `doctor` exit 0 with failed checks (DOCTOR-EXIT-CONTRACT-1, 5-oct) | **live — decision** | C6 |
| re-send answers "submitted" (6-oct 🟡) | **live** | C7 |
| usage errors without an envelope (6-oct: 44 of 45 `JSON_MISSING`) | **live** (+ exit 1 instead of 2, abrupt exit) | D1, D2 |
| `run` / `kaspa doctor` two documents (6-oct `JSON_MULTI`) | **live** | D3, D4 |
| `--amount ""` → 1 KAS (6-oct 🟡) | **live** (+ `--to ""`, `--from ""`) | E ×3 |
| `node reset --json` declined printed nothing, exit 0 (6-oct 🟡) | **fixed** (JSON-ENVELOPE-RESIDUAL-2) | D5 green |
| `--network <unknown>` reached the node and failed untyped | **fixed** (WA-2: `UNKNOWN_NETWORK`) | B0 green |
| `rpc health` typed | **holds** | B3 green |
| `deploy status <label> --verify` RPC failure with exit 0 (5-oct) | **not re-run** (needs a deployment with a txId); code identity: `deployment-runners.ts:249-251` still `UI.error` in a catch without rethrow | — |
| lock conflict surfaced as `TX_SEND_FAILED: … step failed: Workspace is locked…` (6-oct) | **not re-run**; code identity: `commands/tx.ts:803-808` still wraps the step's error text under `TX_SEND_FAILED` | — |

## 10 · Root causes and paths (one table)

| # | Root cause | Path |
| --- | --- | --- |
| R1 | the test verdict is `every(file.state === "pass")`, never vitest's counts; the envelope is written before the typed failure is thrown; vitest's JSON reporter targets stdout; `--network` is recorded, not resolved | `packages/cli/src/runners/test-runner.ts:70,77,96-97,114-121,146-163`; `packages/cli/src/commands/test.ts:9` |
| R2 | the RPC classifier does not recognise the wasm client's "Unable to connect / Cannot connect"; kaspa-rpc's `RpcConnectionError` carries no code; `accounts balance` classifies nothing | `packages/cli/src/cli-errors.ts:142-161`; `packages/cli/src/runners/tx-plan-runner.ts:386-404`; `packages/kaspa-rpc/src/upstream/session.ts:72,140-145`; `packages/kaspa-rpc/src/errors.ts:68-73`; `packages/cli/src/runners/accounts-balance-runner.ts` |
| R3 | `UI.error` records no failure, so `UI.error + return` is exit 0 | `packages/cli/src/ui.ts:92-101` vs `:234-238`; `packages/cli/src/runners/dev-tx-runners.ts:17-22` |
| R4 | `dev tx send` prints success unconditionally; its send is never consented; its "force simnet" is dead code | `packages/cli/src/runners/dev-tx-runners.ts:15,24-35,55-62` |
| R5 | `create --json` writes a nested envelope and no exit code; human path `process.exit(1)` | `packages/cli/src/commands/create.ts:95-108` |
| R6 | `status` tests `.hardkas/` existence only; never loads the config | `packages/cli/src/commands/status.ts:25-31` |
| R7 | `ci verify` collapses any doctor failure into one fixed "corrupted" verdict | `packages/cli/src/commands/ci.ts:29-42,81-87` |
| R8 | `doctor` ties its exit code to a `--strict` the command does not register | `packages/cli/src/commands/doctor.ts:20-24,716-725` |
| R9 | the CLI's outcome label ignores the SDK's `submitted: false` on an idempotent re-send | `packages/cli/src/runners/next-steps.ts:77-89,121-123`; `packages/sdk/src/tx.ts:1664-1681` |
| R10 | commander's own usage handling: text, exit 1, `process.exit` (no `exitOverride`/`configureOutput`) | `packages/cli/src/program.ts:69-77` |
| R11 | a JSON log line on stdout before the envelope; abrupt `process.exit(1)` after `handleError` | `packages/cli/src/commands/run.ts:34-35,45` |
| R12 | `kaspa doctor` prints its result document with `console.log` (outside the output layer), then throws a failure that becomes a second document | `packages/cli/src/runners/kaspa-doctor-runner.ts:106-116` + `handleError` |
| R13 | `||` defaults swallow explicit empty strings | `packages/cli/src/commands/tx.ts:221-223` |
| R14 | abrupt `process.exit()` inside command handlers (R0-I1) | `commands/create.ts:107`, `commands/run.ts:45`, `commands/evidence.ts:36,56,59,65,86`, `commands/init.ts:318`, `commands/chaos.ts:51`, `runners/pskt/capabilities.ts:35` |
| R15 | vacuous tests in the corpus | `packages/testing/test/gauntlet.test.ts:4`; `packages/core/test/fault-injection.test.ts:19-24,44-55`; `packages/kaspa-rpc/test/wrpc-client.test.ts:26-38` |

## 11 · Out of scope here, registered

- WORKFLOW-TIMEOUT-CANCELLATION-1, SDK-SEND-ENDPOINT-AUTHORITY-1, the simulator `null` state (SIMULATOR-STATE-TRUST),
  `replay verify` recreating a missing state: adjacent to "claims vs effects", owned elsewhere.
- The `HANG` of `tx wait` in the sweep is its own default timeout (60 s), as on 6-oct.
- The sweep enumerates the leaf commands of the 6-oct help tree; commands added since (none known) would not be in it.

## 12 · What a fix would have to decide (for the reviewer; nothing implemented)

1. **The `test` verdict (R1):** `ok` from vitest's counts; zero tests selected → `ok:false` with a typed
   `NO_TESTS_FOUND` (or an explicit `--pass-with-no-tests`); skipped is not failed; the envelope carries
   `tests: { total, passed, failed, skipped }`; vitest's JSON goes to a file (or is replaced by the envelope); the
   verdict is computed before the one `writeJson`, so `TESTS_FAILED` is inside it; `network` is the resolved
   execution network. Then the two placeholders and the stub of R15 (delete or implement; the tautology pinned
   properly).
2. **One connection code (R2):** classify "Unable to connect / not connected / Cannot connect" (the regex kaspa-rpc
   already owns) as a typed connection code, in one helper used by `tx plan`, `accounts balance` and `rpc health`; or
   give kaspa-rpc's `RpcConnectionError` a code and let `errorCodeOf` read it. Decide the name (`RPC_UNREACHABLE` vs
   the existing `CONNECTION_REFUSED` / `RPC_NOT_READY`).
3. **Errors are failures (R3–R8):** either `UI.error` records the failure (every red block becomes exit ≠ 0 — the
   broad rule CRC-1 stopped short of) or each remaining site throws a typed `HardkasCliError`; `dev tx send` reports the
   flow's real outcome and either consents to its own send or says it did not send; `create --json` goes through
   `handleError` (and loses its `process.exit`); `status` loads the config and reports a load failure, and treats a
   config-only directory as the root it is; `ci verify` names the failed checks and separates environment from
   workspace; `doctor`'s exit policy (a decision: non-zero on failed checks, or a registered `--strict`).
4. **Idempotence is said (R9):** `outcome: "already-applied"` (or `submitted: false` surfaced) when the SDK returns the
   existing receipt.
5. **Usage errors under the contract (R10–R12):** commander `exitOverride()` + `configureOutput()` so a usage error is a
   `HardkasCliError(USAGE_ERROR, exit 2)` rendered by `handleError` (one JSON envelope, no abrupt exit); the
   observability logger never writes to stdout in JSON mode; `kaspa doctor` returns one document (the result inside the
   failure envelope, or the failure inside the result).
6. **Explicit empties (R13):** `??` instead of `||` (or an explicit "missing vs empty" check) and a typed
   `INVALID_ARGUMENT` for `""`.
7. **Abrupt exits (R14):** replace the nine `process.exit()` calls inside handlers with the R0-I1 pattern (set
   `process.exitCode`, return / rethrow).

## 13 · This evidence

`before/tests/cli-contract-2.test.ts` (the file as run); `before/logs/cc2-before-1.{head,status,exit,log,json}` and
`cc2-before-1.failures.txt` (every failure message, colours stripped), `manual-A4.txt`; `before/probes/`: `test-2` and
`sweep-2` results, network logs, driver logs and the three batteries as run (`harness.mjs`, `adv-test.mjs`,
`adv-sweep.mjs`, unchanged from the 6-oct mini re-audit); `before/scripts/`: the runners. `MANIFEST.sha256` lists every
file of this folder but itself.

---

## 14 · CLI-CONTRACT-2A · TRUTHFULNESS (the reviewer's Phase A, implemented)

**Reviewer, 10-oct: "GO, PHASE A ONLY".** Three fixes, minimal, with discriminating cases and green controls; focused AFTER
and the related SDK/CLI tests; no full gate; nothing else of §12 (commander, the `UNKNOWN` family, `status` / `doctor` /
`ci verify`, the idempotent re-send, the placeholder tests) is touched. STOP condition — "fixing the test verdict
requires replacing the test runner's public API" — did not trigger: `runTest(options)` keeps its signature.

### 14.1 · What changed, where

- **`packages/cli/src/runners/test-runner.ts`** (R1). Two exported helpers: `countTestRun(files)` walks the runner's own
  task tree (suites and files hold `tasks`, tests do not) and counts what was collected, executed, passed, failed,
  skipped and todo, plus the files total and the files that could not run; `testRunVerdict(counts, selection)` returns
  `TESTS_FAILED` when a test failed or a file could not run, `NO_TESTS_FOUND` when nothing was collected,
  `NO_TESTS_EXECUTED` when everything collected was skipped or filtered out (`--scenario` named in the message), else a
  pass. The runner's JSON reporter writes to `.hardkas/runs/<id>/vitest-report.json` (`outputFile`), never to stdout;
  the human reporter stays in human mode. The envelope is written once, the code and message inside it when the run is
  not a pass; the typed error is thrown afterwards (rendered once in human mode, never a second JSON document). The
  human output prints the counts line, "Report saved to …", and "All executed tests passed." only on a pass (the
  unconditional "Scenario execution completed!" is gone). `test-results.json` carries the same report.
- **`packages/cli/src/runners/dev-tx-runners.ts`** (R3, R4). The usage error is a typed `TX_SEND_USAGE` (exit 2 — the
  code `tx send` already uses for the same situation), no longer a red line and exit 0. After the flow, "Transaction
  submitted." is printed only when `result.result === "broadcast"` and the send step is `ok`; otherwise a typed failure:
  the errored step's own code when it has one, else `TX_SEND_NOT_EXECUTED` (exit 1) with the flow's reason — today
  always "--yes is required to broadcast". **Not an intentional stub:** the flow is complete and refuses to broadcast
  without consent; this command never passed it and has no `--yes`. The broadcast was not wired in this wave (the
  reviewer's instruction), so the command is a truthful typed failure until DEV-TX-SEND-NETWORK-1 decides how it
  consents. `TX_SEND_FAILED` (exit 1) if the send ran and the flow still failed. The dead `const network = "simnet"` is
  gone.
- **`packages/cli/src/commands/tx.ts`, `tx plan`** (R13). An explicitly empty or blank `--from`, `--to` or `--amount`
  (option or positional) is refused before the config is loaded and before anything is planned or written:
  `TX_PLAN_USAGE`, exit 2 (the `*_USAGE` convention of `TX_SEND_USAGE` and `LOOKUP_USAGE`), the message naming the
  empty options; omitted options keep their documented defaults through `??` (alice, bob, 1 KAS). Help texts unchanged.
- **Tests.** `packages/cli/test/cli-contract-2a.test.ts` (new, AFTER: 17 cases) and `packages/cli/test/cli-contract-2.test.ts`
  (the BEFORE file, kept). In the BEFORE file, A3 is adapted to the decided contract — it expected "not a failure" and
  the reviewer ruled that a run in which nothing executed is not a pass either, so it now pins the typed middle ground
  (`NO_TESTS_EXECUTED`, `ok:false`) — and the 14 cases outside Phase A are marked `[known gap: … -> CLI-CONTRACT-2B]`
  (skipped, visible in every report, un-skipped by 2B). The file as it ran before any fix is `before/tests/`.

### 14.2 · The contracts after Phase A

| Command · situation | Before | After | Exit |
| --- | --- | --- | --- |
| `test --json`, no test file | `ok:true`, `scenariosExecuted:0`; vitest's exit 1 | one envelope `ok:false, code:"NO_TESTS_FOUND"`, `result.tests.collected: 0`, `verdict:"NO_TESTS_FOUND"` | 1 |
| `test --json`, one passing test | two documents (vitest's report, then `ok:true` with no counts) | one envelope `ok:true`, `result.tests: {collected:1, executed:1, passed:1, failed:0, skipped:0, todo:0}`, `files:{total:1, failed:0}`, `verdict:"PASS"`, `vitestReport: ".hardkas/runs/<id>/vitest-report.json"` | 0 |
| `test --json`, only skipped tests · `--scenario` matching nothing | `ok:false`, no code (`TESTS_FAILED` lost) | `ok:false, code:"NO_TESTS_EXECUTED"` (the pattern named) | 1 |
| `test --json`, a failing test · a file that cannot run | `ok:false`, no code | `ok:false, code:"TESTS_FAILED"`, `message: "N of M executed test(s) failed[; K test file(s) could not run]."` | 1 |
| `test --json`, passing + skipped | — | `ok:true` (executed 1, skipped 1): a skip beside an executed pass is a pass | 0 |
| `test` (human) | "Scenario execution completed!" always | "Tests: N collected, P passed, F failed, S skipped", "Report saved to …", "All executed tests passed." only on a pass; a failure renders `[CODE] message` once | as above |
| `dev tx send` (no arguments) | red "Missing required arguments", exit 0 | `[TX_SEND_USAGE] Missing required arguments. Usage: …` | 2 |
| `dev tx send --from --to --amount` | "Transaction submitted.", no receipt, exit 0 | `[TX_SEND_NOT_EXECUTED] 'dev tx send' did not broadcast (--yes is required to broadcast). Nothing was sent.` — no claim, no receipt | 1 |
| `tx plan --amount ""` · `--to ""` · `--from ""` · `--amount "  "` · positional `""` | a plan with the default (1 KAS, bob, alice), exit 0 | `{ ok:false, code:"TX_PLAN_USAGE", message:"--amount was given but empty. Pass a value, or omit the option for its default. Nothing was planned." }`, nothing written | 2 |
| `tx plan` with options omitted · `--amount 2` | alice → bob, 1 KAS · 2 KAS | unchanged | 0 |

### 14.3 · Compatibility implications (reported, none hidden)

- `hardkas test --json`: a consumer that read vitest's report from stdout no longer finds it there (it was never part
  of the envelope contract; the same numbers are now in `result.tests`, and the raw report is on disk at
  `result.vitestReport`). `ok` is now `false` where it was `true` for an empty or all-skipped run — the change the
  reviewer asked for. New result fields are additive; `passed` keeps its name and now equals the verdict.
- `hardkas test` exit codes: unchanged for a pass (0) and a failure (1); an empty run was already 1 (vitest's), an
  all-skipped run was already 1 (`TESTS_FAILED`); only the codes and the envelope changed.
- `dev tx send`: exit 0 → 2 (usage) or 1 (not executed); the "Transaction submitted." line is gone until the command
  can consent to its own send. No test or script in the repository exercised the command at runtime (grep); nothing
  could have relied on an effect it never produced.
- `tx plan`: `""` values exit 2 instead of planning the default; omitted values unchanged; help unchanged, the generated
  CLI reference untouched.
- No SDK change. `countTestRun` / `testRunVerdict` are exports of an internal CLI runner module, not of the published
  SDK surface. `PUBLIC_API_SURFACE.md` is untouched.

### 14.4 · Runs

| Run | What | Result |
| --- | --- | --- |
| `build-cc2a-1` | turbo `build` + `typecheck`, `@hardkas/cli` and its dependencies | 24 / 24, 24 / 24 |
| `cc2a-after-1` | `cli-contract-2a.test.ts` (AFTER) + `cli-contract-2.test.ts` (the BEFORE file, unchanged) | AFTER **17 / 17**; the BEFORE file 13 green / 15 red (from 4 / 24): A1, A2a, A2b, A5, C1, C2 and the three empties flipped green; A3 red by the decided contract (§14.1); the 14 others are Phase B. 74 s, 0 non-loopback |
| `cc2a-related-1` | the 53 CLI files that plan, sign, send, open the SDK or read the execution contract (WA-2's related set + `workspace-authority-2`) | 147 suites, **373 tests: 365 green, 0 red, 8 skipped** (the corpus's labelled known gaps) — gate-hermetic PASS, 0 non-loopback, 647 s |
| `cc2a-after-2` | the two files after A3's adaptation and the 14 labelled skips | **45 tests: 31 green, 0 red, 14 skipped** (the 14 `[known gap … -> CLI-CONTRACT-2B]`): the AFTER file 17 / 17, the BEFORE file 14 / 14 of its active cases — gate-hermetic PASS, 0 non-loopback, 48 s |

### 14.5 · Still open after Phase A (CLI-CONTRACT-2B, the reviewer's order of §12)

The `UNKNOWN` family (R2); `UI.error` as a failure, `create --json`, `status`, `ci verify`, `doctor` (R3, R5–R8); the
idempotent re-send label (R9); commander's usage errors, the logger line in `run`, `kaspa doctor`'s two documents
(R10–R12); the abrupt `process.exit()` sites (R14); the corpus placeholders (R15); the `--network` claim of the test
report (A6, the option's documented semantics would change); `dev tx send`'s consent (DEV-TX-SEND-NETWORK-1: a `--yes`
or an implicit dev consent in the simulator).

### 14.6 · Trees

The native binary the build rewrites (`packages/pskt-native/hardkas-pskt-native.win32-x64-msvc.node`) was restored to
HEAD before any manifest, as in every wave. **Code tree** (this evidence folder excluded):
**`3e57caf618e5462ea308b00700e4f6e24427a81e`** over HEAD `3c61d15f6` (tree `1136a8425751c4f0ed60e731088fcd7ffcb9e6e5`);
5 paths (3 modified: `packages/cli/src/commands/tx.ts`, `packages/cli/src/runners/dev-tx-runners.ts`,
`packages/cli/src/runners/test-runner.ts`; 2 added: `packages/cli/test/cli-contract-2.test.ts`,
`packages/cli/test/cli-contract-2a.test.ts`), +762 / −26; code patch `cli-contract-2a-code.patch` sha256
`aa1d320d64e842dcae38eeb2211746ba090a09e2617fc0a9ddbfff7a0b877f60`. Computed with a temporary index
(`after/scripts/manifest-cc2.ps1 -Mode code`), never the worktree's own. The **full tree** (code + this folder) is
computed by `manifest-cc2.ps1 -Mode final` once these documents are frozen — it writes `MANIFEST.sha256` (every file of
this folder but itself) and then the tree the owner's commit must reproduce; that hash cannot be written here without
changing itself, so it travels with the handover (`manifest-final-f1/tree.txt`, the full patch `cli-contract-2a.patch`,
its sha256 and `MANIFEST.blobs`). The evidence tree frozen before FULL-GATE-1 was `d58cd526…` (f1, 52 paths); the gate
runs of §14.7 and this section were added afterwards, so the handover's final manifest is **f2** — the code tree is the
same `3e57caf6…` in both, verified before and after every build and gate.

### 14.7 · FULL-GATE-1 (the reviewer's GO of 2026-10-11, on the frozen base, no fixes)

Sequence, as ordered: verify the patch, the manifest and both trees → repeat the Phase A contracts → full build and
typecheck → the full hermetic gate → restore only the known side effects and verify the trees again.

| Step | Result |
| --- | --- |
| frozen state | `MANIFEST.sha256` re-derived from the 46 files: identical; code tree `3e57caf6…` (5 paths) and full tree `d58cd526…` (52 paths) recomputed with a temporary index: exact; the delivered patch's sha256 `1dae6c13…`: exact; HEAD `3c61d15f6` |
| `cc2a-after-3` | the two files again: **45 tests: 31 green, 0 red, 14 skipped** — the 14 `[known gap … -> CLI-CONTRACT-2B]` titles listed in the log; PASS, 62 s, 0 non-loopback |
| `build-cc2a-full-1` | `turbo run build` (everything) stopped at **`@hardkas/docs#build`** (apps/docs, docusaurus): `MODULE_NOT_FOUND … url-loader/dist/cjs.js` inside `node_modules/.pnpm` — the worktree's copy of `url-loader@4.1.1` holds 5 files and no `dist/`, the owner's checkout holds 11 with it; `turbo run typecheck` (everything): **54 / 54** |
| `build-cc2a-full-2` | `turbo run build --continue` without the docs site: **44 / 45**; the one failure is **`@hardkas/dashboard#build`** (apps/dashboard, `vite build`): "CLIENT_ENTRY does not point to an existing file … vite/dist/client/client.mjs" — the worktree's `vite@6.4.3` `dist/` holds 7 files, the owner's 15 (the client entry among them). **Classification:** both failures are the same environmental fault — files missing from the isolated worktree's `node_modules/.pnpm` (the `%TEMP%` cleaner, a known hazard of this machine), in two apps built by vite / docusaurus; `pnpm-lock.yaml`, `package.json` and `apps/docs` are untouched; no product package is involved and the hermetic gate (vitest) needs neither build. Not repaired (no `pnpm install` in this wave: it would change the environment under test); reported as is |
| side effects of the full build | `labs/showcase-suite/**` (32 files) rewritten with LF — empty diff under `--ignore-cr-at-eol`, the known CRC-1 side effect — and the native `.node`; both restored with `git checkout --`; the trees recomputed afterwards: code `3e57caf6…` and full `d58cd526…`, exact |
| `cc2a-gate-1` | **inconclusive, kept:** 1208 suites, **2946 tests: 2902 green, 0 red, 42 skipped** (the 28 the base already skips + the 14 labelled Phase B cases) **and 2 left pending** — vitest exit 1 on one unhandled error, "Worker exited unexpectedly" (a tinypool child process died); the one unfinished file is `packages/sdk/test/sdk-parity-0-9-1.test.ts` (its 2 tests never finished; the JSON reporter warned "some tests are still running"). 1471 s, 0 non-loopback, `C:\.hardkas` absent, Docker daemon down (both snapshots the same connection error). Side effect: the artifacts `.snap` EOL rewrite, restored. **Classification:** no test failed; the unfinished file exercises the SDK's `capabilities.get` and `localnet.status` and shares nothing with the three CLI files of Phase A; run alone (`cc2a-parity-1`) it passes 2 / 2 in 5 s; WA-2's gate on the same machine had no unhandled error; the worktree's environment is degraded (the build row above). A nondeterministic death of one worker process, not a product failure, not attributable to the patch. The run is kept; the second full gate is the reproduction attempt |
| `cc2a-gate-2` | the same frozen tree, the `.snap` restored first: **PASS** — 1208 suites, **2946 tests: 2904 green, 0 red, 42 skipped** (28 + 14, no other skip), 0 pending, **no unhandled error**, vitest exit 0; 1422 s; 0 non-loopback; `C:\.hardkas` absent before and after; Docker daemon down; the loopback targets are the same families as every gate (the refused node port 18210, the fixtures' fixed ports, the suites' ephemeral servers, `127.0.0.1:1` = the refused Docker endpoint). Side effect: the `.snap` EOL rewrite again, restored; the code tree recomputed afterwards: `3e57caf6…`, exact |
| acceptance | **zero new failures** (0 red in both gates; gate 1's two pending tests pass in gate 2 and alone); **the 14 Phase B cases kept as labelled known gaps** (14 skipped in both gates; 42 = 28 + 14, nothing else skipped); **no access to the canonical localnet** (0 non-loopback attempts; the node port refused; Docker down; `C:\.hardkas` never created); **exit code, `ok`, `verdict` and counts agree** — pinned inside the gate by the 17 AFTER cases (A1–A8 for `hardkas test`, B1–B2, C1–C5) and by the gate's own numbers |
