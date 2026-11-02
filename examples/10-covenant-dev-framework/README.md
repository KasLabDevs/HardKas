# Example 10 — HardKAS Covenant Dev Framework (`GuardedVaultCounter`)

This example demonstrates the complete Kaspa L1 / Toccata / SilverScript v1.0.0 Covenant Development workflow in HardKAS:

`WRITE → COMPILE → AUDIT → PREFLIGHT → TEST → FUZZ → DEBUG → SIMNET`

`GuardedVaultCounter` (`contracts/guarded-vault-counter.sil`) is a 1:1 auth-bound covenant counter: line 12 checks the
owner's signature, line 13 requires `delta > 0`, and line 15 keeps the covenant's value (`output >= input - max_fee`), so
no caller can drain it.

## Three Strict Verification Levels

HardKAS enforces a strict separation between three verification levels so structural tests never masquerade as contract-script or consensus proofs:

1. **`SYNTHETIC` (`STRUCTURAL_PREFLIGHT`)**: Validates v1 transaction topology, `state_span`, signature slots, compute budgets, storage mass, and fee floors (`validateV1Transition`). Does **not** execute the Kaspa Script VM. It is mandatory: a transition it refuses never passes, whatever the VM says.
2. **`SCRIPT_VM` (`SCRIPT_VM_PREFLIGHT`)**: Executes the compiled contract bytecode on the SilverScript runner, a local `cli-debugger` build (`kaspa-txscript` engine). It verifies `require(...)`, Schnorr signatures (`SIGHASH_ALL`), introspection opcodes (`OpAuthOutputIdx`, `tx.outputs[i].value`), and successor state wrappers with source-mapped `.sil:line:col` diagnostics. A runner that cannot give a verdict (not found, refused, does not start, times out, prints something that is not the runner's protocol, fails internally) is reported as such (`BLOCKED` with its class), never as a contract rejection. See the runner trust policy below.
3. **`CONSENSUS_SIMNET` (`CONSENSUS_SIMNET_PREFLIGHT`)**: Submits the transition to an isolated `rusty-kaspad` v2.1.0 simnet node and observes what the node did with it. `CONSENSUS_SIMNET_PASS` only when the node's answer names the expected transaction id **and** its UTXO index then shows the transaction's effect (every output listed under that id, the spent input gone). The node's own rejection is `CONSENSUS_SIMNET_FAIL`; an answer naming no transaction or another one, a timeout, or an acceptance without observed inclusion is `CONSENSUS_SIMNET_INCONCLUSIVE`; a request that never reached the node is `BLOCKED`. Every result records the stages it reached: `BUILT`, `SENT`, `RPC_ACCEPTED`, `NODE_ACCEPTED` (the node accepted it: mempool or UTXO index), `DAG_CONFIRMED` (included as observed at that moment, not final).

None of these levels is mainnet or a public testnet: simnet is a local node, and a SCRIPT_VM verdict is the verdict of an
unverified local runner.

## SilverScript runner trust policy

Upstream (kaspanet/silverscript) publishes no `cli-debugger` binary, so HardKAS has no trusted reference for any runner
and none is invented: the list of trusted digests is empty and cannot be extended at run time.

- Every runner is identified before it runs: path, SHA-256, size, where it was found (`--runner`/API path,
  `HARDKAS_SILVER_RUNNER`, or `<HARDKAS_HOME>/toolchains/cli-debugger/1.0.0/`, whose `toolchain.json` version is only a
  claim), provenance `unmanaged-local-build`, and trust `UNVERIFIED`.
- What runs is the bytes that were identified: they are read once, and a private copy of them under
  `<HARDKAS_HOME>/run/silver-runners/` is started (never the configured path, which Windows could resolve to another
  `.exe`), checked again right before each start (the trace is a second start) and removed afterwards. A copy whose bytes
  changed is never started (`RUNNER_UNVERIFIED`, or `SILVER_RUNNER_CHANGED` in `silver test`).
- Residual limits of that check, against a process running as the **same user** (it can write the copy's directory):
  - it can swap the copy between the last check and the start. Node.js has no atomic "check and start": the check reads
    the whole copy (about 8.5 MB for a `cli-debugger` build) and hashes it, so the window is in the order of tens of
    milliseconds, not microseconds;
  - on Windows it can also place a DLL next to the copy, in its private directory, which the runner would load first;
  - none of this is new to that process: it can already replace the configured runner, or the CLI itself. The copy's
    directory is created fresh for each run (owner-only on POSIX, the user's own profile ACLs on Windows).
- On Linux and macOS the copy starts only what the configured file could start as it is, natively
  (`RUNNER_START_FAILED`; `SILVER_RUNNER_START_FAILED` in `silver test`, otherwise):
  - the file must be executable here: HardKAS never grants an execute permission it lacks (a `noexec` mount counts);
  - on Linux it must be an ELF executable for this machine (class, byte order, type, architecture, program headers inside
    the file); on macOS a Mach-O executable for this Mac, or a universal binary with its slice;
  - or a script whose `#!` names an absolute, executable interpreter that is itself such a native executable.
  The exec family (`execvp` and its kin) hands a file the kernel cannot load to `/bin/sh`; these checks refuse every
  such file they can see before it starts. The copy itself is then never started through the exec family: Node.js
  checks its digest once more and that it is still executable, then replaces itself with it through `process.execve`
  (`execve(2)`, no shell fallback). A file that passes the checks and that the kernel still refuses ends the start with
  `RUNNER_START_FAILED` (the kernel's error code named): it was not executed, and nothing ran through `/bin/sh`. That
  start ends in a Node.js abort, so a system that keeps crash reports may keep one for `node` (on WSL, a core dump of
  several hundred MB under `%TEMP%\wsl-crashes`). `HARDKAS_HOME` must be on a filesystem that allows execution: a copy
  that cannot be executed there is refused when it is made.
  What this changed on Linux and macOS: a runner on a `noexec` mount, or a shell script without `#!`, used to start (the
  first from its copy under `HARDKAS_HOME`, the second through `/bin/sh`) and is now refused. Finding a runner is not
  starting it: `resolveAvailableSilverRunner` (API) reports a runner it found and identified without checking that it can
  start; one that cannot is refused at its start, with `RUNNER_START_FAILED`.
- `hardkas silver test` follows the same policy: without the opt-in it exits 3 (`SILVER_RUNNER_UNVERIFIED`); with it, its
  record says `evidence: "unverified-vm-scenario"` and `runner.trust: "UNVERIFIED"`, never official.
- By default an `UNVERIFIED` runner is **never executed**: the SCRIPT_VM step is `BLOCKED` (`RUNNER_UNVERIFIED`) and the
  commands exit 3 (`SILVER_RUNNER_UNVERIFIED`). This holds wherever the runner was found, the toolchains directory included.
- The explicit opt-in runs it anyway, still labelled `UNVERIFIED` in every report (`runner`, `runnerWarning`):
  `--allow-unverified-runner` (CLI), `runnerTrust: "allow-unverified"` (API), or `HARDKAS_SILVER_RUNNER_TRUST=allow-unverified`
  (exactly that value). The SilverScript runner test level declares this opt-in in its config. Prefer the flag, per
  command: the variable relaxes the policy for every command of that shell, including a runner left in
  `<HARDKAS_HOME>/toolchains/cli-debugger/1.0.0/`. `hardkas env check` and `hardkas doctor` warn while it is set, and a
  `silver test` record says where its runner was found (`runner.source`) and which opt-in let it run (`runner.trustOptIn`).
- `hardkas artifact verify` checks that a record is coherent, not that it is authentic: records are not signed. An
  "official" record must name a `VERIFIED` runner whose digest is in the trusted list, which is empty, so no record can be
  official today.
- A runner driven through another program (a stand-in run as `node <script>`, as the tests do) is never `VERIFIED`.

## Reproducible Commands

```bash
# 1. Static Security Audit: heuristic AST/source rules (COV-AUTH-001, COV-VALUE-001, COV-STATE-001, COV-INDEX-001,
#    COV-TERM-001, COV-BUDGET-001). Findings to review, not a proof of security. Exit 1 only with --fail-on-high.
node packages/cli/dist/index.js silver audit examples/09-silver-reference/contracts/owned-counter.sil --json
node packages/cli/dist/index.js silver audit examples/10-covenant-dev-framework/contracts/guarded-vault-counter.sil --json

# SCRIPT_VM steps (2-4) run a local cli-debugger build named by HARDKAS_SILVER_RUNNER. It is UNVERIFIED (no official
# binary exists): without --allow-unverified-runner it is never executed and the command exits 3 (SILVER_RUNNER_UNVERIFIED).

# 2. Transition Preflight (requires explicit --constructor-args/--args/--state/--next-state, or --demo-fixture for generated lab fixtures)
#    --level STRUCTURAL_PREFLIGHT runs the structural validation only (no runner needed)
#    Numbers in --state, --next-state and --args (here and in step 3) are judged by their own JSON literal, on purpose:
#    only a plain integer between -(2^53 - 1) and 2^53 - 1 is accepted. A fraction or an exponent (5.0, 1e3) is refused
#    even when its value is an integer, and so is a larger integer: write it as {"kind":"int","value":"<digits>"}
#    (exit 2, SILVER_JSON_NUMBER_UNSAFE). Nothing is rounded silently.
#    --constructor-args follows the same rule at any depth and in any key order, except that a larger plain integer is
#    kept exact (it goes on as its digits). In every option the string form of an int must be its decimal digits, an
#    optional '-' included: "", "0x10", " 10 ", "+5" or "5.0" are refused (exit 2, SILVER_JSON_INT_INVALID).
node packages/cli/dist/index.js silver preflight examples/10-covenant-dev-framework/contracts/guarded-vault-counter.sil --entry bump --demo-fixture --allow-unverified-runner --json

# 3. Kaspa Script VM Step-by-Step Debugger & Source-Mapped Diagnostics (explicit inputs, or --demo-fixture for generated ones)
#    Three verdicts kept apart: structural (v1 validation), SCRIPT_VM and global. Exits 0 only when both levels pass
#    (APPROVED); exits 1 when either rejects the transition, unless --allow-failure is passed for interactive inspection
node packages/cli/dist/index.js silver debug examples/10-covenant-dev-framework/contracts/guarded-vault-counter.sil --entry bump --demo-fixture --allow-unverified-runner --json

# 4. Bidirectional Property-Based Fuzzing in SCRIPT_VM. The oracle is the counter rule: a transition must pass iff
#    delta > 0 and next.value = previous.value + delta within the SilverScript int range. Every run first evaluates fixed
#    boundary samples of both directions (delta 1, 0, -1; a successor one above and one below; the largest successor and
#    increment; an increment past the int range; a value across 2^53; a negative state), then --runs generated ones (a
#    third legitimate, a third with a non-positive delta, a third with a wrong successor), and needs at least 3 of each
#    direction. Every sample needs the VM's own verdict; a runner that gives none stops the run (SILVER_RUNNER_<class>).
#    A VM that rejects everything, or accepts everything, fails (SILVER_FUZZ_FAILED, exit 1).
node packages/cli/dist/index.js silver fuzz examples/10-covenant-dev-framework/contracts/guarded-vault-counter.sil --entry bump --runs 8 --seed 20261029 --allow-unverified-runner --json
#    --backend SYNTHETIC checks the structural compute-budget bounds instead (no runner; no contract logic is judged)
node packages/cli/dist/index.js silver fuzz examples/10-covenant-dev-framework/contracts/guarded-vault-counter.sil --entry bump --backend SYNTHETIC --json

# 5. Run the example's own test suites, each at its own test level
#    silverc level (pinned silverc installed): static analysis, structural validation, compute-budget bounds
pnpm vitest run --config vitest.silverc.config.ts examples/10-covenant-dev-framework/test/guarded-vault-counter.silverc.test.ts
#    SilverScript runner level (silverc + HARDKAS_SILVER_RUNNER naming a local cli-debugger build; the level's config opts
#    in to the UNVERIFIED runner): SCRIPT_VM transition and drain, bidirectional transition and authorization properties
pnpm vitest run --config vitest.silver-runner.config.ts examples/10-covenant-dev-framework/test/guarded-vault-counter.silver-runner.test.ts
#    simnet level (Docker; the harness raises an isolated rusty-kaspad v2.1.0 simnet node): node acceptance and DAG
#    confirmation of a valid transition, and the node's own rejection of a value drain
pnpm vitest run --config vitest.simnet.config.ts examples/10-covenant-dev-framework/test/guarded-vault-counter.simnet.test.ts
```

## Exit codes of the `silver` dev commands

| Exit | Meaning |
| --: | :-- |
| 0 | `audit` report written; `preflight` PASS; `debug` APPROVED (or any rejection with `--allow-failure`); `fuzz` PASS |
| 1 | a rejection (`SILVER_PREFLIGHT_FAILED`, `SILVER_DEBUG_STRUCTURAL_REJECTED`, `SILVER_DEBUG_CONTRACT_REJECTED`), a fuzz failure (`SILVER_FUZZ_FAILED`, `SILVER_FUZZ_INSUFFICIENT_COVERAGE`, `SILVER_FUZZ_NO_VM_EVIDENCE`, `SILVER_FUZZ_EVALUATION_ERROR`), HIGH findings with `audit --fail-on-high`, or a runner that gave no verdict (`SILVER_RUNNER_NOT_FOUND`, `_START_FAILED`, `_TIMEOUT`, `_PROTOCOL_ERROR`, `_INTERNAL_ERROR`; `fuzz` also `_CHANGED` when the runner changes during the run) |
| 2 | usage: a missing file, synthesized inputs without `--demo-fixture`, an unknown entry, an invalid option (`SILVER_OPTION_INVALID`), a JSON number or int string that is not exact (`SILVER_JSON_NUMBER_UNSAFE`, `SILVER_JSON_INT_INVALID`), a contract `fuzz` cannot judge (`SILVER_FUZZ_SHAPE_UNSUPPORTED`) |
| 3 | the trust policy refused the runner (`SILVER_RUNNER_UNVERIFIED`) |
| 4 | a tampered compile record (`SILVER_RECORD_TAMPERED`) |

The full option reference is `docs/reference/cli.md` (`hardkas silver audit`, `preflight`, `debug`, `fuzz`).
