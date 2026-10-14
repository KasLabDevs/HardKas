# WORKSPACE-AUTHORITY-2 · investigation + BEFORE (2026-10-10) — SDK-EXECUTION-IGNORED

**Scope (reviewer, 2026-10-10):** reproduce `SDK-EXECUTION-IGNORED` on the published HEAD `3b0651e7f`, identify which
SDK execution options are ignored, where the workspace's authority is lost, and whether that allows executing in a
context other than the requested one. Investigation and BEFORE only: no implementation, no full gate, no commits, the
demo's localnet untouched. Deliverable: reproduction, controls, real impact, contract alternatives.

**Where:** isolated worktree `%TEMP%\hk-ra\wt`, detached at `3b0651e7f` (SECRET-SURFACE-2 published; clean). Scratch
`cut48-workspace-authority-2/` (runner, logs, probes). Evidence here: `before/tests/*` (the two BEFORE files as run),
`before/logs/wa2-before-{1,2,3}.*` (every run kept), `before/logs/wa2-probe-*.log` (the two SDK probes), the runner.

## 1 · The contract, and who follows it

A workspace declares where it executes through the **`execution` contract** of `hardkas.config.ts` — either one target
`{ mode, domain, network }` or `{ default, targets }` (what `hardkas init` scaffolds: `simulator` and `localnet`, default
`simulator`; `docs/guides/real-node-transfer.md`, `docs/concepts/execution-worlds.md`: "resolve the ExecutionTarget
before attempting to interact with the blockchain; never infer execution mode from a network string"). The deprecated
`defaultNetwork` is kept as a legacy key, and `DEFAULT_HARDKAS_CONFIG` carries `defaultNetwork: "simulated"` as "the
mirror of the default target for the readers that still use the legacy key" (PAPERCUTS #37, `config/src/defaults.ts`).

| Reader | What it follows | Where |
| --- | --- | --- |
| CLI `tx plan` / `tx sign` / `tx send` (+ `--target <name>`, `--network`) | `execution` (`resolveNewIntentTarget`; a `--network` must match a target or is refused with `EXECUTION_NETWORK_MISMATCH`) | `cli/src/runners/tx-plan-runner.ts:81-151`, `tx-sign-runner.ts:66`, `tx-send-runner.ts:57-97` (+ `assertExecutionCompatibility`) |
| CLI shortcut flow (`tx send --from --to --amount`) | `execution.default`, then the three runners above | `cli/src/runners/tx-flow.ts:123-130` |
| CLI account listing / dev accounts / localnet / deployments | `execution` (`listHardkasAccounts(config)` reads `execution.default`/`targets`) | `accounts/src/resolve.ts:93-117`, `cli/src/runners/dev-accounts-runners.ts:31` |
| **SDK `Hardkas.open`** | **`options.network ‖ config.defaultNetwork ‖ "simnet"`** — `execution` is never read | `sdk/src/index.ts:280` |
| SDK everywhere else | `config.defaultNetwork` (`resolveRpcUrl` 261, the mutable slot 338, `get network()` 380; `tx.ts` observerId 254, plan 384, consolidation 679, send 1564; `workflow.ts:364-374`; `utxos.ts`, `observe/*`, `environment.ts`, `capabilities.ts`) | 13 reads in `sdk/src`, 23 consumers of `sdk.network` |
| SDK `accounts.resolve(name)` without a target | `execution` (through `listHardkasAccounts`) | `sdk/src/accounts.ts:15-22` → `accounts/src/resolve.ts:101-113` |

The SDK's option surface (`HardkasOptions`): `cwd`, `configPath`, `workspaceRoot`, `hardkasDir`, `mode`
(developer/agent — not an execution mode), **`network`** (a network *name*), `autoBootstrap`, `signer`, `logger`,
`policy`, `wasm`. There is **no `target` / `execution` option**: the SDK cannot be asked for a named target at all.
`HARDKAS_NETWORK` is only the dev server's and the script/test runners' child-process variable; `config.network.default`
(`config/src/types.ts:77`) has no reader anywhere.

## 2 · Where the authority is lost (three places, one defect)

1. **The loader injects a contradictory mirror.** `loadConfigFile` merges `{ ...DEFAULT_HARDKAS_CONFIG, ...userConfig }`
   (`config/src/load.ts:78`): a user config that declares `execution` and never wrote `defaultNetwork` now carries
   `defaultNetwork: "simulated"` — the *built-in* default's mirror, not the user's target. The loader only handles the
   opposite case (legacy key without `execution` → the built-in `execution` is deleted, `load.ts:107`). `config show
   --json` prints both: `execution.default: "localnet"` and `defaultNetwork: "simulated"`, side by side.
2. **The SDK resolves its world from the mirror.** `Hardkas.open` (`sdk/src/index.ts:280`) and every reader above take
   the network from `defaultNetwork`, decide `isSimulated` from that name or the `networks[name].kind`, and build the
   provider accordingly (`LocalnetSimulatedProvider` or a `JsonWrpcKaspaClient` on `resolveRpcUrl()`).
3. **Inside one SDK call, two authorities.** `tx.plan` resolves the accounts *without* a target
   (`tx.ts:370-377`, so they follow `execution`), then chooses the planner, the UTXO source and the artifact's
   `mode`/`networkId` from `defaultNetwork` (`tx.ts:384, 528-571`). Nothing checks the pair: the CLI runs
   `assertAccountCompatible(account, execution)` (`tx-plan-runner.ts:123`); the SDK path never calls it.

## 3 · Reproduction (BEFORE, hermetic; `before/logs/wa2-before-3.*`; red on `3b0651e7f` by design)

Workspace = `hardkas.config.ts` with the scaffold's two targets and **`execution.default: "localnet"`** (the developer
switched the project to the node), plus an initialised `.hardkas/`. No node is running (the hermetic harness refuses
`127.0.0.1:18210`).

| # | What was asked | CLI (the contract) | SDK, on the same bytes | Verdict |
| --- | --- | --- | --- | --- |
| WA2-A1 | open the workspace | `resolveNewIntentTarget` → `{ mode: localnet, network: simnet }` | `sdk.network = "simulated"`, provider `LocalnetSimulatedProvider` | **red** |
| WA2-A2 | the single-target form `execution: { mode: "rpc", network: "devnet" }` | `{ mode: rpc, network: devnet }` | `"simulated"`, simulated provider | **red** |
| WA2-A3 | `sdk.tx.plan({ from: "alice", to: "bob", amount: "1" })` | `tx plan --json` goes to the node: exit 1, `Cannot connect to Kaspa RPC at ws://127.0.0.1:18210` (code `UNKNOWN`, untyped — CLI-CONTRACT-2), **no plan** | a plan: `mode: simulator`, `networkId: simulated`, `plannerAuthority: SYNTHETIC_SIMULATOR`, 1 input, 1 KAS, fee 0.01 KAS — **silently, no warning** | **red** |
| WA2-A4 | the same plan, looked at closely | `accounts list` → alice is a **kaspa** identity (`kaspasim:qqlpk9…`, network simnet) | `sdk.accounts.resolve("alice")` → the same kaspa identity; the plan **spends that kaspasim address inside the simulator** (the simulator's genesis funds the deterministic accounts under their real addresses too) | **red**: a cross-world artifact (`execution-worlds.md` "Identity Isolation") |
| WA2-A5 | `Hardkas.open({ network: "localnet" })` — the target's *name*, as the config spells it | `tx plan --target localnet` is a named target; `--network localnet` → "Unknown HardKAS network" | without `allowPublic`: refused by the **public-network guard** (`PUBLIC_NETWORK_BLOCKED`: "treated as a public or external network" — the wrong reason; control C5). With the guard off through the SDK option (`policy.allowPublic: true`; the config form needs `experimental: true`): **it opens** — `sdk.network = "localnet"`, a `JsonWrpcKaspaClient` on the canonical `ws://127.0.0.1:18210` (the fallback of `resolveRpcUrl`), alice resolves as *synthetic* (`execution.default` is the simulator); `tx.plan` then dies with `COINBASE_MATURITY_UNRESOLVED` ("kaspa-wasm has no parameters for 'localnet'") — late, oblique, three authorities in one instance (`before/logs/wa2-probe-a5-1.log`) | **red** |
| WA2-A6 | `loadHardkasConfig` of that workspace | — | `config.defaultNetwork === "simulated"` while `execution` resolves to `simnet` | **red** (the mechanism of §2.1) |
| WA2-A7 | sign and send the mixed plan of A4 | — | `tx.sign(plan, "alice")` → **`SIGNER_MISMATCH`**: "The signer kaspa:sim_alice is not the plan's from kaspasim:qqlpk9…" (sign resolves alice under the plan's simulator target → the synthetic alice; the plan's from is the kaspa alice). No receipt. | green: caught downstream, by an unrelated check with a misleading message (`before/logs/wa2-probe-2.log`) |

Controls (green before and after; the harness and the honoured paths): C1 the scaffold default (simulator) — SDK and
resolver agree, a plan is `simulator`/`simulated` over `kaspa:sim_alice`; C2 the legacy key alone
(`defaultNetwork: "simnet"`) — both sides infer the localnet node; C3 the one SDK option that exists, `network`, is
honoured (simnet over the scaffold default, simulated over the localnet default); C4 `network: "mainnet"` without
`allowPublic` → `PUBLIC_NETWORK_BLOCKED` before anything opens; C5 (see A5); CLI: `tx plan` in the localnet-default
workspace never simulates (exit 1, no plan), in the scaffold workspace it plans in the simulator over synthetic
identities.

Runs (every one kept): `wa2-before-1` 12 tests — 7 green / 5 red (A1 A2 A3 A4 A6); A5 was green for the wrong reason
(the public guard), A7 and C5 did not exist yet. `wa2-before-2` 14 — 9 / 5 (A5 reshaped with `allowPublic: true` in the
config — green again, for yet another wrong reason: the loader refuses `allowPublic` without `experimental`; A7 green
as above; C5 added). **`wa2-before-3` 14 — 8 green / 6 red: A1 A2 A3 A4 A5 A6, each for its row above** (A5 with the
guard off through `policy.allowPublic`: the SDK opens on an invented network `localnet` over `ws://127.0.0.1:18210`).
0 non-loopback attempts in every run (one loopback attempt at `127.0.0.1:18210`, the CLI control).

## 4 · Real impact (what can happen, in which direction)

- **Silent downgrade — the direction that happens by itself.** A project whose config says "the node" (localnet,
  devnet, a testnet) runs in the simulator as soon as it is driven through the SDK: `Hardkas.open(dir)`, `sdk.tx.plan`,
  `sdk.workflow.run`, `sdk.wallet.open`, `sdk.observe`, `sdk.tx.status`'s observer identity — all of them. The
  artifacts say the truth about where they ran (`mode: simulator`, `networkId: simulated`, `SYNTHETIC_SIMULATOR`), so
  evidence is not forged; but the **caller asked for the node and got synthetic success**: a test suite or a CI job
  written against the SDK "passes" without ever touching the node the project declares (this is the mechanism behind
  TEST-VACUOUS-PASS's family). The CLI, on the same project, does the opposite. Two tools, one project, two worlds.
- **Cross-world artifacts.** Because accounts follow `execution` and the world follows the mirror, the SDK plans a
  simulator payment that spends a kaspa identity (A4). Today the ownership check of `tx.sign` stops it
  (`SIGNER_MISMATCH`), with a message that blames the signer rather than the world; nothing in the plan path refuses
  the pair, and nothing records that the plan was made against a world the workspace did not declare.
- **Invented contexts.** A target name passed as `network` is accepted once the public guard is off: the SDK reports a
  network called `localnet`, talks to the canonical endpoint by fallback, and fails later with a coinbase-maturity
  error (A5). Unknown names are not refused as unknown.
- **Upgrade to a real network — not reachable through the config.** The dangerous direction (simulator declared,
  real node used) needs an explicit `options.network`; the public networks stay behind `allowPublic` (C4), the local
  ones (simnet, devnet) do not. The config's `execution` cannot push the SDK onto a node, because the SDK never reads
  it. (The explicit `network` option is honoured and consistent within the SDK: C3.)
- **Not a WA-1 regression.** WORKSPACE-AUTHORITY-1 fixed *which directory* is the workspace (one root, WA-I0). This
  is the next authority: *which world* that workspace executes in. The root is right; the world is not.

## 5 · Contract alternatives (for the reviewer's decision; nothing implemented)

**C-A — one resolver, one authority (recommended, in stages).**
1. The loader never injects a mirror that contradicts the user's `execution`: when `execution` is declared,
   `defaultNetwork` is derived from the resolved target (`resolveNewIntentTarget(config).network`) or left absent;
   the deprecation warning stays reserved for configs that really wrote the legacy key (PAPERCUTS #37 kept).
2. `Hardkas.open` resolves its execution target with the CLI's resolver (`resolveNewIntentTarget`), records it on the
   instance (`sdk.execution`), derives `sdk.network` and the provider from it, and the `tx`/`workflow`/`observe`
   readers follow that one target (the 13 `defaultNetwork` reads in `sdk/src`).
3. `HardkasOptions.target?: string` (a named target, parity with `--target`); `network` stays as the override it is
   today, but it must name a known network and must be consistent with the resolved target's world, else a typed
   refusal (`EXECUTION_NETWORK_MISMATCH`, as the CLI) — and an unknown name is refused as unknown, before the public
   guard speaks.
4. `tx.plan` asserts account/world compatibility (`assertAccountCompatible`, as the CLI) before planning.
   Invariant to pin: **WA2-I1** one workspace, one execution authority — SDK and CLI resolve the same target from the
   same bytes; **WA2-I2** no artifact mixes an identity of one world with the execution of another; **WA2-I3** a name
   that is neither a network nor a target is refused, typed, before anything opens.

**C-B — the derived mirror only (minimal).** Stage 1 of C-A alone: `load.ts` sets `defaultNetwork` from the resolved
execution target whenever `execution` is declared. The SDK then follows `execution.default` indirectly and A1/A2/A3/A4/A6
go green; `--target` parity (A5-class refusals) and the in-call compatibility check are left for later. Smallest diff;
the legacy slot stays the SDK's authority.

**C-C — fail closed on disagreement.** `Hardkas.open` compares its resolution with `resolveNewIntentTarget` and refuses
to open when they differ. Blunt (every scaffold-derived localnet project stops working through the SDK until it also
writes `defaultNetwork`), but it would stop the silent downgrade immediately. Not recommended on its own.

Out of scope, registered on the way: the CLI's `tx plan` connection failure is `UNKNOWN` (untyped; `classifyRpcError`
does not recognise "Unable to connect" — CLI-CONTRACT-2); `config.network.default` has no reader (dead field);
`sdk.accounts.balance` returns an object the probe printed as `[object Object]` (not examined).

STOP for the reviewer: a decision among C-A / C-B / C-C (and the stages), then implementation with these BEFORE tests
turned green, their controls kept, and the usual qualification.

## 6 · Implementation — C-A, bounded (reviewer's GO, 2026-10-10)

Reviewer's decisions: `execution` is the canonical authority; SDK and CLI share ONE resolver in `@hardkas/config`
(never the CLI imported from the SDK, never a duplicate); `Hardkas.open` honours `execution.default` without an
override; `target` added only if API-compatible; `network` validated as a network id, never a target name; a
target/network conflict is a typed error; no silent fallback to the simulator; account/world compatibility before any
plan, through the shared rule; the public-network guard and `allowPublic` kept whole; `defaultNetwork` is legacy
compatibility, never a second authority (STOP if an incompatible config migration were needed); the 14 BEFORE tests
kept, controls added; focused AFTER + related sdk/config/cli/accounts + build/typecheck; no full gate yet.

### 6.1 · The chain, now one function

`resolveWorkspaceExecution({ config, target?, network? })` in `packages/config/src/resolve.ts` (next to
`resolveNewIntentTarget`, which it reuses), returning `{ execution, networkId, networkTarget, source, targetName? }`:

| Input | Resolution |
| --- | --- |
| nothing | `resolveNewIntentTarget(config)`: `execution.default` → `targets[default]`, or the single `execution`, or the legacy `defaultNetwork` inference. An `execution.default` that names no declared target is `EXECUTION_TARGET_NOT_FOUND` — it was silently replaced by the mirror before |
| `target` | `execution.targets[target]`, else `EXECUTION_TARGET_NOT_FOUND` (both config forms) |
| `network` | must be a key of `networks` (built-ins merged), else `UNKNOWN_NETWORK` (with the hint "is a named execution target: select it with target" when it is one); the alias `simnet` → `simulated` of a simulated `networks.simnet` applies; then the declared target whose network it is (either form), else the mode the network implies (`simulated` → simulator, `simnet`/`devnet` → localnet, igra → evm-l2 rpc, else rpc: the CLI's long-standing inference, now in one place) |
| both | the target decides; the network must equal the target's network, else `EXECUTION_NETWORK_MISMATCH` |
| the result | `networkId` must be declared in `networks` unless the mode is the simulator, else `UNKNOWN_NETWORK` |

Precedence, stated once: **target > network > `execution` > legacy `defaultNetwork`**; nothing ever falls back to the
simulator; every refusal is a `HardkasError` with one of the three codes above (or core's
`EXECUTION_TARGET_UNRESOLVED` when a config declares nothing at all).

### 6.2 · Who calls it

- **SDK** (`packages/sdk/src/index.ts`): `HardkasOptions.target` (new, optional, additive); `Hardkas.open` resolves
  once, before the public guard, the bootstrap and the provider: `activeNetwork = networkId`, `isSimulated =
  execution.mode === "simulator"`; the instance exposes `sdk.execution` (the target) and `sdk.executionSource`
  (`"target" | "network" | "execution" | "defaultNetwork"`); `sdk.network` is the resolved network, no longer a
  reading of the legacy key; `resolveRpcUrl` follows it. The in-memory `loaded.config.defaultNetwork` is set to the
  resolved network (a derived mirror for whoever still reads the legacy key off the instance's config; never written
  to disk). A workspace without a config file now opens on a **copy** of the built-in config: `open` used to mutate
  the shared module constant (`defaultNetwork`, `wasm`) for the whole process.
- **SDK readers** (`tx.ts` ×4, `workflow.ts`, `utxos.ts`, `observe/index.ts`, `observe/backends.ts`,
  `capabilities.ts`): `sdk.network` / `sdk.execution` instead of `config.defaultNetwork || "simnet"`; a plan's,
  consolidation's and workflow's `mode` is the resolved target's mode (a `{ mode: "simulator", network: "simnet" }`
  target is the simulator whatever the label says — `tx.ts` decides the world by the mode on the instance's network,
  by the network's declaration only for an explicit per-call network); `tx.send` is simulated iff the instance's mode
  is the simulator (an explicit RPC URL still wins, as before).
- **SDK accounts** (`accounts.ts`): `resolve(name)` and `list()` default to `sdk.execution`, so the identities are
  those of the world the instance runs on (synthetic under a simulated override of a localnet project; kaspa under
  `target: "localnet"` of the scaffold).
- **SDK `tx.plan`**: the accounts are resolved under `sdk.execution` and **`assertAccountCompatible` (the CLI's rule,
  `@hardkas/accounts`) runs on `from` and `to` before any plan exists**: an identity of another world is
  `ACCOUNT_NETWORK_MISMATCH` ("Expected: simulated, Actual: simnet"), nothing is written, no plan artifact, no
  `SIGNER_MISMATCH` later.
- **CLI**: `tx-plan-runner.ts` (its own target/network block of 70 lines replaced by the one call; the alias and the
  mismatch check live in the resolver), `tx-sign-runner.ts` and `tx-send-runner.ts` (`--target` lookup through the
  resolver: `EXECUTION_TARGET_NOT_FOUND`, typed, instead of a plain `Error`), `tx-flow.ts` (the shortcut flow's
  effective network from the resolver instead of its own three-line reading).
- **Loader** (`config/src/load.ts`): for a config that declares `execution` and never wrote `defaultNetwork`, the
  merged `defaultNetwork` is derived from the declared default target (alias applied) instead of inheriting the
  built-in default's `"simulated"`; in memory only. A config that wrote `defaultNetwork` (legacy, no `execution`) is
  untouched and still the only one warned. No file is rewritten, no migration: the STOP condition did not arise.
- **Docs**: `docs/guides/sdk.md` states the SDK contract (default = `execution`, `target`, `network`, the codes).

### 6.3 · Compatibility (what changes for whom)

- Projects that declare `execution` and drive the SDK: they now run where they declared. The localnet/devnet/testnet
  projects that silently ran in the simulator through the SDK now go to their node — and a project declaring a
  **public** network in `execution` is now stopped by the public guard at `Hardkas.open` unless it allows public
  networks (`PUBLIC_NETWORK_BLOCKED`, control C4), where it used to open silently on the simulator. Fail-closed, as
  decided.
- The scaffold default (simulator) and legacy configs (`defaultNetwork` alone): unchanged (controls C1, C2, T6, T7).
- `Hardkas.open({ network })` with a valid network id: the same destination as before for every id the corpus uses
  (`simulated`, `simnet`, `devnet`, `testnet-10` with `allowPublic`; T5, C3). The SDK's `network` was already an
  override; what changed is that an **unknown** name is refused (`UNKNOWN_NETWORK`) instead of becoming a network of
  that name over the canonical endpoint (A5), and that `accounts.resolve` follows the override too.
- CLI: `--network <unknown>` on `tx plan` is `UNKNOWN_NETWORK` at resolution (it used to reach the node and fail with
  an untyped connection error); a single-target config with a matching `--network` keeps the declared mode (it used
  to be re-inferred from the name); `--target` errors are typed. `--network` as a target name is refused with the
  hint. No CLI help or option changed; the generated reference is untouched.
- The SDK's public API: one optional option (`target`) and two readonly members (`execution`, `executionSource`)
  added; nothing removed or renamed. `PUBLIC_API_SURFACE.md` is the owner's release regeneration.

### 6.4 · Runs (hermetic runner; every run kept under `after/logs`)

| Run | Files | Result |
| --- | --- | --- |
| `build-wa2-after-1` | turbo `build` + `typecheck`, filters config / sdk / cli (their dependencies rebuilt by turbo) | build 24 / 24, typecheck 26 / 26 |
| `wa2-after-1` | the two WA2 files (14 BEFORE + 10 SDK AFTER + 3 CLI AFTER) | **25 / 27**: A1–A6 green; two of my own tests outdated by the fix — **A7** awaited the mixed plan that can no longer be made (the SDK now asks the node, refused by the harness: adapted to accept the refusal) and **C5** expected the public guard's wrong-reason refusal (now `UNKNOWN_NETWORK`, the right one: adapted). Kept |
| `wa2-related-a-1` | `packages/config/test`, `packages/accounts/test`, `packages/sdk/test` (whole hermetic dirs: 206 files) | 448 tests: **435 green / 8 red / 5 skipped** — the same two WA2 cases, and **6 in `sdk/test/adversarial/wave2-d-send-fee.test.ts`** (`ACCOUNT_NETWORK_MISMATCH: Expected simulated, Actual simnet`) |
| `wa2-related-b-1` | 52 CLI files (every file that plans, signs or sends, opens the SDK or reads the execution contract; `help-truth`, `secret-surface-2` included) | 367 tests: **356 green / 3 red / 8 skipped** — `wave2-b-planner-convergence` (2), `wave2-c-pending-spend` (1), the same mismatch |
| — | the 9 red cases above | one cause, in three test harnesses, not in the product: they opened the SDK on the simulator and **re-pointed it afterwards by writing `sdk.config.config.defaultNetwork = "simnet"`** — the legacy mutable slot this wave stops treating as an authority (the world is resolved once, at open). The three harnesses now open the SDK on the network they mean to plan on (`network: "simnet"`, a `.hardkas/` created first); nothing else in the corpus writes that key (grep) |
| `wa2-after-2` | the two WA2 files, A7 and C5 adapted | **27 / 27**, 0 non-loopback |
| `wa2-related-c-1` | the three adapted harness files | **17 / 17**, 0 non-loopback |

Every run: 0 non-loopback attempts (the loopback targets are the tests' own fake nodes, refused ports and the
hermetic `127.0.0.1:18210`). No full gate: the reviewer's order.

### 6.5 · Manifest (code, tests and docs; this evidence folder excluded)

Computed from a temporary index (the worktree's own index untouched), base **`3b0651e7f`** (HEAD tree `d28be569`),
the native binary turbo rewrote restored to HEAD first, `git diff --check` clean:
**code tree `2e6bb1f934966e6e30dd409887d91b33f676d316`** — 20 paths (18 modified, 2 added), +881 / −137; code patch
`cut48-workspace-authority-2/manifest-code-m1/workspace-authority-2-code.patch`, sha256
`980ac2997e99dd7c5e321f0156505ef894ce50dbc4a439ddfee1670457263f03` (the diff the reviewer reviews). Product:
`config/src/{resolve,load}.ts`, `sdk/src/{index,accounts,tx,workflow,utxos,capabilities}.ts`,
`sdk/src/observe/{index,backends}.ts`, `cli/src/runners/{tx-plan-runner,tx-sign-runner,tx-send-runner,tx-flow}.ts`;
docs: `docs/guides/sdk.md`; tests: the two WA2 files (added) and the three adapted harnesses. The full tree, its
`MANIFEST.sha256` and the integration patch come with the full gate, after the reviewer's acceptance.

## 7 · The reviewer's qualification hold (2026-10-10) — verification

### 7.1 · The two related sets, complete, with the adapted harnesses

| Run | Files | Result |
| --- | --- | --- |
| `wa2-related-a-2` | `packages/config/test`, `packages/accounts/test`, `packages/sdk/test` — 206 files | **448 tests: 443 green, 0 red, 5 skipped** (the fixed skips); 0 non-loopback |
| `wa2-related-b-2` | the same 52 CLI files | **367 tests: 359 green, 0 red, 8 skipped**; 0 non-loopback (loopback targets: the tests' own servers and refused ports) |

The arithmetic of the first round, exactly: related-A had **8** red = **2** of my own WA2 tests, outdated by the fix
itself (A7 awaited a mixed plan the SDK can no longer make; C5 awaited the public guard's wrong-reason refusal) +
**6** in `wave2-d-send-fee`; related-B had **3** red (`wave2-b` ×2, `wave2-c` ×1). 8 + 3 = 11 = **9 caused by the three
harnesses** (the legacy mutable slot) **+ 2 caused by my own tests**. The "nine" in the hand-over counted the harness
cases only; the two others were listed with the focused run. Nothing else was adapted; each adaptation is justified by
the contract (an open instance is not re-pointed by writing `defaultNetwork`; the harnesses open on the network they
plan on).

### 7.2 · Per-call overrides (`after/probes/wa2-overrides-probe.mjs`, `wa2-consolidation-probe.mjs`; logs `wa2-overrides-probe-1`, `wa2-consolidation-probe-{1,2}`)

On a simulated instance (the scaffold default; `sdk.execution.mode = simulator`, `LocalnetSimulatedProvider`):

| Path | Outcome | Verdict |
| --- | --- | --- |
| `tx.plan({ networkProfile: "simnet" })` | refused — the identities are checked against the instance's world **first** (a kaspa identity: `ACCOUNT_NETWORK_MISMATCH`, probe P4); with synthetic identities the override then sends the plan to the upstream planner, which refuses the synthetic address ("The address contains an invalid character", untyped) | **no bypass**; the misuse of `networkProfile` as a network (`tx.ts`, pre-existing) is a papercut with an untyped error, registered (§6.6) |
| `tx.plan({ networkProfile: <an artifact id> })` | `COINBASE_MATURITY_UNRESOLVED` (the id used as a network) | no bypass; same papercut |
| `tx.send(simulatorSigned, "ws://…")` (explicit URL) | `SYNTHETIC_NOT_BROADCASTABLE`, typed | no bypass |
| `tx.plan({ amount: "all" })` | `UPSTREAM_PLANNER_EMPTY` — the consolidation path runs the Generator over synthetic UTXOs (pre-existing: the same path before this wave) | papercut, registered |
| `observe.address({ address, target: "simnet" })` | **an observation labelled `{ mode: localnet, network: simnet }` produced by the simulated provider** (the RPC observer backend over `sdk.rpc`) | an observation of another world, from the wrong backend: not a spend, not persisted by itself — reported for the decision (§7.4) |
| **`createConsolidationPlan({ account: <external-wallet simnet OBJECT>, selectedUtxos: <real UTXOs>, destination, network: "simnet" })`** (P1) | **a plan: `mode: localnet`, `networkId: simnet`, `execution { localnet, simnet }`, 2 inputs, from the real `kaspasim:` address, `plannerAuthority` absent** | **BYPASS, reproducible** |
| the same object, no `network` (P2) | **a plan `mode: simulator`, `networkId: simulated` over the simnet identity** — the A4 mixing, without any override | **BYPASS: the path has no account/world check at all** |
| `account: "alice"` (synthetic in this world) + `network: "simnet"` (P3) | **a plan `mode: localnet` over `kaspa:sim_alice`** | **BYPASS** |

`createConsolidationPlan` is a public method of `sdk.tx` and the CLI's `accounts consolidate` runner calls it
(`accounts-consolidate-runner.ts:201`, with `network: resolvedName` and an account object). The plans come back to the
caller; nothing is written by the call itself (the workspace after the probe holds the simulated state and its snapshot
evidence only: `wa2-consolidation-probe-2.log`). Downstream, such a plan is stopped by the signer (`SIGNER_MISMATCH`)
or by the simulator's authorization check — the same accidental, late, misleading stops A4/A7 documented. **Per the
reviewer's rule this is a STOP: the case is presented, nothing more was implemented.**

### 7.3 · Coherence SDK ↔ CLI, legacy included (`wa2-overrides-probe-1.log`, part 3)

Thirteen (config, override) pairs — the scaffold with no override / `network: simnet` / `target: localnet` /
`network: devnet`; the localnet default with no override / `network: simulated` / `target: simulator`; the single-target
rpc devnet; legacy `defaultNetwork: simnet`; legacy `defaultNetwork: simulated`; a custom `networks.simnet.rpcUrl`; no
config file, with and without `network: simnet` — resolved on both sides (`resolveWorkspaceExecution` as the SDK and
the CLI runners call it; `resolveProvider` for the CLI's endpoint; `resolveRpcUrl()` for the SDK's):
**target, network id, mode and source agree in 13 / 13**; the legacy workspaces resolve through `defaultNetwork`
(source `"defaultNetwork"`) to the same world on both sides; the in-memory mirror equals the resolved network in every
case. The **endpoint** differs in two pairs, both pre-existing and in the CLI's `resolveProvider`: for a localnet-mode
network it always answers the canonical localnet endpoint (`ws://127.0.0.1:18210`), ignoring the network's own
`rpcUrl` — `network: devnet` (the SDK uses `ws://127.0.0.1:18610`, the declared devnet port) and a custom
`networks.simnet.rpcUrl` (the SDK uses it, the CLI does not, unless `--url` is given). Not introduced here; registered
(§7.4).

### 7.4 · What is presented for the decision (nothing implemented)

1. **`createConsolidationPlan`** — the minimal fix, in the terms of this wave: resolve the per-call `network` through
   `resolveWorkspaceExecution` against the instance (a different world is a typed refusal, or the plan carries that
   resolved target explicitly — the reviewer's call), and run `assertAccountCompatible` on the account and the
   destination before the plan, exactly as `tx.plan` now does; record `plannerAuthority`. Two small edits in `tx.ts`;
   a BEFORE/AFTER pair for P1–P3; `accounts consolidate` (CLI) re-run.
2. **`observe.address({ target })`** — resolve `target` the same way, and refuse (or route to a client of that
   network) instead of observing another world through this instance's provider.
3. **`resolveProvider` endpoint for localnet-mode networks** (CLI) — prefer the declared `networks[id].rpcUrl`, the
   canonical endpoint only as the default; separate ticket (CANONICAL-RPC-URL family).
4. `networkProfile` misused as a network in `tx.plan`; `plan({ amount: "all" })` empty in the simulator — papercuts.

The full gate was **not** run: the condition "no authority bypass" is not met until item 1 is decided.

## 8 · Bounded closeout (reviewer's GO, 2026-10-10): the three ways out, closed

Authorised: (A) `createConsolidationPlan` under the instance's authority, with the shared account/world rule and the
UTXOs checked before any plan; (B) `observe.address({ target })` coherent with the instance's provider, mismatch typed;
(C) the CLI honours the endpoint the resolved network declares. Nothing else; `networkProfile` stays a papercut; the
public SDK API unchanged.

### 8.1 · Regressions first (`wa2-closeout-before-1`, against the implementation the hold reviewed)

Eight new cases, **all red** for the predicted cause, the previous 27 green (`after/logs/wa2-closeout-before-1.*`):

| Case | Before the fix |
| --- | --- |
| X1 · P1 (simulated instance, simnet identity, real UTXOs, `network: simnet`) | a localnet plan |
| X2 · P2 (the same identity, no override) | a simulator plan over the simnet identity |
| X3 · P3 (synthetic alice, `network: simnet`; `network: nonsense`) | the planner's untyped "invalid character" error — not a refusal of the override |
| X4 · synthetic alice over UTXOs that are not hers (real ones, another address) | **a simulator plan with 2 foreign inputs** |
| X5 · control (an instance on simnet consolidates its simnet identity) + its third part, `network: simulated` on that instance | the control held; the third part produced a simulator plan |
| X6 · `observe.address({ target: "simnet" })` on a simulated instance | an observation labelled localnet/simnet from the simulated provider |
| X7 · the endpoint chain (devnet, a custom simnet URL) | the resolver carried no endpoint; the CLI's `resolveProvider` answered the canonical localnet for both |
| CLI · `tx plan` under a custom `networks.simnet.rpcUrl` | the connection error named `ws://127.0.0.1:18210`, not the declared `ws://127.0.0.1:1` |

### 8.2 · The fixes (minimal, in the terms of §6)

- **A · `sdk/src/tx.ts` `createConsolidationPlan`**: the instance's `sdk.execution` is the authority. A per-call
  `network` goes through `resolveWorkspaceExecution` (unknown → `UNKNOWN_NETWORK`) and must resolve to the instance's
  own network, else `EXECUTION_NETWORK_MISMATCH` ("a consolidation on 'simnet' needs an instance opened on it"); the
  account and the destination (resolved under that world) pass `assertAccountCompatible`; every selected UTXO must carry
  the account's own address, else `UTXO_ACCOUNT_MISMATCH` ("a consolidation spends the account's own UTXOs only"). All
  of it before `planConsolidation`; the plan's `networkId`/`mode` are the instance's. Nothing is written by the call.
  The CLI `accounts consolidate` opens its SDK on `--network` when given (as `tx send` does), so a per-call network is
  never asked of an instance of another world.
- **B · `sdk/src/observe/index.ts`**: an explicit `target` is resolved by the shared resolver (unknown →
  `OBSERVATION_UNKNOWN_TARGET`, typed, the old code kept) and must be the instance's network, else
  `OBSERVATION_TARGET_MISMATCH`; the backend is always the instance's own (`resolveObserverBackend(sdk)`): the label and
  the provider cannot disagree. `watchAddress` / `waitForAddress` go through the same door.
- **C · the endpoint**: `resolveWorkspaceExecution(...).rpcUrl` carries the endpoint the resolved network declares;
  `resolveProvider` gains `networkRpcUrl` and uses it in every RPC branch (`--url` still first; the canonical localnet
  only when the localnet-mode network declares none); the four CLI call sites pass it (`tx plan`, `tx send`, `accounts
  balance`, `accounts consolidate`). The SDK's `resolveRpcUrl()` already read the declared URL: the two sides now meet.
- Docs: `docs/guides/sdk.md` (one sentence on per-call options).

### 8.3 · Runs

| Run | Files | Result |
| --- | --- | --- |
| `wa2-closeout-before-1` | the two WA2 files, closeout cases added | **27 green / 8 red** — the eight new cases, each for its predicted cause (§8.1) |
| `build-wa2-closeout-1` | turbo `build` + `typecheck`, config / sdk / cli | 24 / 24, 26 / 26 |
| `wa2-closeout-after-1` | the two WA2 files | **35 / 35**, 0 non-loopback (the `127.0.0.1:1` attempt is the CLI endpoint case reaching the declared URL) |
| `wa2-related-a-3` | `packages/config/test`, `packages/accounts/test`, `packages/sdk/test` (complete, 207 files) | **455 tests: 450 green, 0 red, 5 skipped** |
| `wa2-related-b-3` | the 52 CLI files (complete) | 367 tests: 357 green, **2 red**, 8 skipped — `json-stream-1.test.ts` (`accounts consolidate --dry-run --json`, `--execute --yes --json`): `TypeError: Cannot read properties of undefined (reading 'mode')`. Not the contract: that test stands a **double** in for the SDK (`vi.mock("@hardkas/sdk")`, a fake without `execution`), and the consolidate runner now reads `sdk.execution.mode` for the provider. The runner reads it tolerantly (`sdk.execution?.mode`: every real instance carries one); the test is untouched |
| `build-wa2-closeout-2` | turbo `build` + `typecheck`, cli (and its dependencies) | 24 / 24, 24 / 24 |
| `wa2-closeout-after-2` | the two WA2 files, final tree | **35 / 35**, 0 non-loopback (loopback: `127.0.0.1:1` ×1 — the endpoint case —, `127.0.0.1:18210` ×13) |
| `wa2-related-b-4` | the 52 CLI files (complete), final tree | **367 tests: 359 green, 0 red, 8 skipped** — gate-hermetic PASS, 0 non-loopback, 636 s |

The three invariants the reviewer set for the gate are met on the final tree: the closeout cases (35 / 35), the
sdk/config/accounts suites (0 red) and the CLI suites (0 red). The one full hermetic gate follows (§8.6).

### 8.4 · Errors, artifacts, side effects, endpoints (what the reviewer asked to see)

- **Typed errors** of the closed paths: `EXECUTION_NETWORK_MISMATCH`, `UNKNOWN_NETWORK`, `ACCOUNT_NETWORK_MISMATCH`,
  `UTXO_ACCOUNT_MISMATCH`, `OBSERVATION_TARGET_MISMATCH`, `OBSERVATION_UNKNOWN_TARGET` — every one a `HardkasError`
  with a message that names the two worlds or the missing ownership and says nothing was planned / observed.
- **Artifacts and side effects**: none on refusal (the workspace tree is compared before and after in X1–X4); a
  consolidation never wrote by itself and still does not; an observation writes only when `produceArtifact` asks.
- **Resolved endpoints** (X7, SDK = CLI): scaffold + `network: devnet` → `ws://127.0.0.1:18610`; a custom
  `networks.simnet.rpcUrl` → `ws://127.0.0.1:1`; scaffold + `network: simnet` → the canonical `ws://127.0.0.1:18210`;
  an explicit `url` wins; the simulator has none. `tx plan` under the custom URL names `ws://127.0.0.1:1`.
- **Preserved**: `allowPublic` (untouched), legacy configs (T6/T7/C2), the SDK's explicit `network` override (T5/C3),
  the shared resolver (the only one). No public API change: `createConsolidationPlan` and `observe.address` keep their
  signatures; what changed is what they refuse.

### 8.5 · Residual risks, registered (the list of §6 and §7.4, updated after the closeout)

- `sdk.tx.plan({ networkProfile })` uses the profile reference as the plan's network (`tx.ts`: `activeNetwork =
  options.networkProfile || sdk.network`) — pre-existing, untouched; a profile reference is not a network id. It
  cannot change the world (the account check and the UtxoProvider follow the instance) — the failure is the planner's,
  typed or not (§7.2).
- The per-call overrides of §7.4 (consolidation `network`, observation `target`) are now validated through the shared
  resolver against the instance (§8). What remains per-call: `tx.send(signed, url)` with an explicit URL broadcasts to
  that URL — the SDK's explicit-URL contract, pre-existing; a synthetic authorization is refused
  (`SYNTHETIC_NOT_BROADCASTABLE`, §7.2), a real one reaches the node named. Consolidation plans still record no
  `plannerAuthority`.
- The CLI's `tx plan` connection failure is still `UNKNOWN` (CLI-CONTRACT-2). TEST-VACUOUS-PASS is not claimed closed
  by this wave. `config.network.default` remains unread.
- A workspace that declares a public network in `execution` must now also declare `network.allowPublic: true` (which
  the loader requires `experimental: true` for) before the SDK opens it — the guard's existing contract, now reached
  by the declared target too.

### 8.6 · The one full hermetic gate (`wa2-gate-1`) and the trees

Run after the three invariants held, on the final tree with the committed native binary restored (the builds of §8.3
rewrite `packages/pskt-native/hardkas-pskt-native.win32-x64-msvc.node`; it is restored to HEAD before any manifest, as
in every wave). Code tree (this evidence folder excluded) **`43c4b39228f3c5fc42529a091f5dfc9cff03d511`** over HEAD
`3b0651e7f` (tree `d28be569`): 23 paths (21 modified, 2 added), +1153 / −157; code patch
`workspace-authority-2-code.patch` sha256 `5f9859bcac95bbf24feb525f7b3009db56dec759493c5fd0910a3feaa9239565`.

`wa2-gate-1` — `scripts/gate-hermetic.mjs` over the whole repository (vitest only, no build; any non-loopback
connection attempt fails the gate), `HARDKAS_HOME` under `%TEMP%\hk-v210-gate-home`, the worktree's status recorded
before the run (`after/logs/wa2-gate-1.status`: the 23 code paths of the manifest and this folder, nothing else):

| | |
| --- | --- |
| result | **gate-hermetic PASS** — vitest exit 0, `success=true`, 0 failed suites |
| counts | 1198 files · **2901 tests: 2873 green, 0 red, 28 skipped** |
| against the base's gate (SECRET-SURFACE-2: 2866 / 2838 / 0 / 28) | +35 tests, +35 green — exactly this wave's two files (29 SDK + 6 CLI); nothing else moved |
| non-loopback attempts | **0** |
| loopback targets | `127.0.0.1:59291` ×11, `127.0.0.1:60106` ×3, `127.0.0.1:7420` ×6, `127.0.0.1:8545` ×11, `127.0.0.1:9` ×6, `localhost:59187` ×1, `localhost:7420` ×7 — the same families as `wa2-related-b-4` (§8.3): the suites' own ephemeral local servers, the fixtures' fixed loopback ports and the unreachable-port cases |
| duration | 1383 s |
| `C:\.hardkas` | absent before and after (`after/logs/wa2-gate-1.env`) |
| containers | Docker Desktop's daemon was not running during the gate: both snapshots (`docker-before/after-wa2-gate-1.txt`) are the same connection error, so no container could be reached, let alone changed; the gate needs none |
| side effects on the tree | one, known from every full gate: the artifacts suite rewrote `packages/artifacts/test/adversarial/__snapshots__/wave1-1-canonical-v5.test.ts.snap` with CRLF endings (empty diff under `--ignore-cr-at-eol`); restored to HEAD with `git checkout --`. The code tree recomputed afterwards (`manifest-code-m3`) is the same `43c4b392…`, blob for blob, the patch's sha256 identical |

Logs: `after/logs/wa2-gate-1.{head,status,exit,env,log,json}` (the vitest JSON report included). 64-hex strings in the
log: 7 distinct — a test's canonical hash, a policy id, an artifact id, two `contentHash` values and one hash-mismatch
pair (expected / got) — digests all, no key material.
