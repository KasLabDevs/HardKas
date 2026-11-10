# @hardkas/ext-l2 (experimental Lab)

The Igra L2 (EVM) lab as a HardKAS CLI extension: `hardkas l2 …` (profiles, JSON-RPC health and queries, EVM
transaction build/sign/send, contract deploy plans, bridge assumptions), plus `l2 metamask`, `l2 wizard` and
`l2 doctor`. The HardKAS core (`@hardkas/cli`, `@hardkas/sdk`) neither depends on nor loads `@hardkas/l2` or `viem`;
this package brings them.

Igra is an EVM-compatible L2 built on Kaspa; Kaspa L1 does not execute EVM. This is a Lab, not the L1 core.

## Install

**Not published in this release.** `@hardkas/ext-l2` and its dependency `@hardkas/l2` are private workspace packages
(owner policy, provisional): `hardkas extension install l2` cannot fetch them from npm, and works only with a local
build or tarballs. See `docs/status/versioning.md` ("Not published"). Once published:

In the project (it is a devDependency, at the CLI's exact version):

```bash
npx hardkas extension install l2
```

From a local tarball (offline), with the SHA-256 published for it:

```bash
npx hardkas extension install l2 --from ./hardkas-ext-l2-<version>.tgz --sha256 <hash>
```

`extension install`:
- installs only `@hardkas/ext-l2`, at the CLI's exact version;
- runs the package manager with install scripts disabled (`--ignore-scripts`); this package declares none;
- with `--from`, checks the tarball's SHA-256 and its manifest (name, version, extension id, no install-time scripts)
  before the package manager runs;
- downloads no toolchain and starts no process.

`hardkas extension list` shows its state; `hardkas doctor l2` runs its checks; `hardkas.config` can disable it with
`extensions: { l2: false }`.

## Foundry (anvil, forge, cast)

The extension pins Foundry v1.8.6 for win32-x64 and linux-x64 (glibc); the core's toolchain manager installs it, only
when asked:

```bash
npx hardkas toolchain install foundry                      # download from the official release
npx hardkas toolchain install foundry --from-file <asset>  # offline, from the release asset on disk
npx hardkas toolchain status
```

- Installing the extension downloads and runs nothing; `hardkas doctor l2` reports whether Foundry is installed.
- The asset is streamed to a file while it is hashed, and must match the pinned SHA-256 (the release's `.sha256`)
  before anything is extracted; a download that does not match is deleted.
- Only `anvil`, `forge` and `cast` are extracted (by streaming, under their pinned names), each checked against its
  pinned size and SHA-256; the install is swapped in atomically and verified again where it lands.
- A previous verified install is left untouched when a new install fails.
- Elsewhere (macOS, ARM, musl/Alpine) Foundry is not offered (`TOOLCHAIN_PLATFORM_UNSUPPORTED`) rather than installed
  unverified.

## Solidity project and offline compile

```bash
npx hardkas create l2-evm my-app          # minimal project: no forge-std, no git dependency
npx hardkas toolchain install solc        # solc 0.8.38, pinned (or --from-file <official binary>, offline)
npx hardkas l2 compile                    # forge + solc, offline; writes out/ and .hardkas/l2-build.json
npx hardkas l2 compile --check            # rebuilds in a temporary directory; L2_BUILD_NOT_REPRODUCIBLE if it differs
```

- solc 0.8.38 is pinned for win32-x64 and linux-x64 (glibc): the official static builds of binaries.soliditylang.org,
  checked by SHA-256 (the digest in the official `list.json`, equal to the one GitHub publishes for the release).
- `l2 compile` runs only the verified forge and the verified solc; without them it refuses with the install command.
  forge gets `--offline` and `--use <verified solc>` (they win over `foundry.toml`), inherited `FOUNDRY_*` variables are
  dropped and the proxies point to a closed loopback port: nothing is downloaded at build time.
- The compiler that really ran is read back from every artifact's metadata and must be the pinned one
  (`L2_COMPILER_MISMATCH` otherwise).
- The template's `evm_version = "cancun"` is **provisional**: it does not show that Igra runs this EVM version.
- Contracts that fail with "Stack too deep" need `via_ir = true` in `foundry.toml` (commented in the template).

## Deploy, call and test locally

```bash
npx hardkas l2 test                                   # the project's Solidity tests, offline (forge + pinned solc); FFI refused
npx hardkas l2 node start                             # the local Anvil (see below)
npx hardkas l2 dev deploy Counter                     # a contract of the verified build → address, receipt, gas
npx hardkas l2 dev send Counter increment             # transaction → receipt, gas used, decoded events
npx hardkas l2 dev call Counter number                # eth_call → decoded result
npx hardkas l2 dev send Counter setNumber --args '[42]' --from 1
npx hardkas l2 dev accounts                           # the node's development accounts
```

`hardkas l2 dev` only ever talks to the local Anvil node this workspace's HardKAS started; it has no `--url`,
`--network` or `--chain-id`, and RPC environment variables are ignored.

**Scope of this guarantee:** it is a property of `hardkas l2 dev` only. `hardkas l2 tx build|sign|send` is a different
path: `l2 tx sign --account` signs with HardKAS's account store, and `l2 tx send --url <url> --network <profile>`
sends a signed transaction to the URL you give, under that path's own guards (chain id must equal the profile's,
mainnet only with `--allow-mainnet`, fee ceilings on Galleon, the `local` profile loopback only). Nothing here shows
compatibility with Igra, Galleon or Kasplex: Anvil is a local test chain, and the template's `cancun` is provisional.

Before anything is sent `l2 dev` checks, from what the operating system reports (not from the node record alone):
- the pinned Foundry is installed and verified, and the running node is the instance HardKAS started (PID, OS start
  time, executable), that executable being the verified anvil;
- its REAL command line (Windows: the process command line; Linux: `/proc/<pid>/cmdline`) is the recorded one and is
  exactly what `hardkas l2 node start` runs (`--host 127.0.0.1 --port <recorded> --chain-id 31337 --accounts <n>`):
  any other flag (`--fork-url`, `--no-mining`, `--gas-limit`, `--state`…) or order is refused — the same rule
  `l2 node stop` applies;
- the OS socket table shows the port served on 127.0.0.1 only, by that very PID (Windows: `Get-NetTCPConnection`;
  Linux: `/proc/net/tcp*` + `/proc/<pid>/fd`); on other systems this cannot be read and the node is refused;
- the node answers chain id 31337 — checked again right before every transaction (Igra 38833, Galleon 38836 or any
  other chain id is refused, and nothing is sent);
- the sender is one of the node's own development accounts: they sign (eth_sendTransaction); HardKAS holds no key, and
  every transaction carries chainId 31337.

Only contracts of the last verified build are deployed (their bytecode must match `.hardkas/l2-build.json`). Gas is
estimated first: a transaction that would revert is reported with its decoded reason (custom errors, `Error(string)`,
`Panic`) and not sent; with an explicit `--gas-limit` the estimate is skipped and a mined revert is reported as
`L2_TX_REVERTED`. Deployments are recorded per node instance: after a node restart (Anvil keeps state in memory) a
name from the previous instance is refused as stale.

All of these checks run again right before every transaction. That narrows, but does not close, the window between
the check and the send: the request goes to a port, not to a process handle. A local attacker who can write
`.hardkas/` AND start an anvil with exactly the arguments HardKAS uses cannot be told apart from the node HardKAS
started; the checks stop records that do not match the real process, not a same-user attacker who reproduces it
exactly. This is a local development tool, not a security boundary.

Arguments (`--args`) are coerced from the ABI types at every depth (arrays, fixed arrays, tuples): integers must be safe
JSON numbers or exact decimal strings (a JSON number beyond 2^53 is refused, never rounded), range-checked for their
bit width; addresses, bools, bytes and strings are checked too (`L2_ARGS_INVALID`). The ABI used to encode and decode
must be the one of the verified build (its digest is in `.hardkas/l2-build.json`).

### FFI

`hardkas l2 test` refuses a project whose effective Foundry configuration enables FFI (`ffi = true`), with
`L2_FFI_NOT_ALLOWED`: with FFI a test can run any command on your machine (`vm.ffi`). The decision is taken on
`forge config --json` (profiles and overrides resolved by forge itself, with the same environment as the test run;
`FOUNDRY_FFI=false` alone would not override `ffi = true` in `foundry.toml`). For a project you trust:
`hardkas l2 test --allow-ffi`.

## Local Anvil node

```bash
npx hardkas l2 node start [--port 8545] [--accounts 10]   # 127.0.0.1 only, chain id 31337
npx hardkas l2 node status
npx hardkas l2 node logs [--tail 50]
npx hardkas l2 node stop
```

- It runs only the verified Foundry `anvil`; without it the command refuses with the install command and starts
  nothing. It never installs Foundry, starts Docker or changes `PATH`.
- Anvil binds `127.0.0.1` only. A port already in use is refused before anything is spawned.
- The core's process manager records the instance it started under `.hardkas/processes/l2-anvil/` (PID, OS start
  time, executable, arguments, binary hash, log), written atomically, with a lock so two starts give one process.
- `stop` acts only on the instance it recorded: the OS identity (PID + start time + executable) is read again right
  before the signal. A PID that now belongs to another process is reported as `foreign_process` and left alone; an
  identity that cannot be read is `unverifiable` and nothing is stopped.
  - The process's real command line must also be the recorded one (a record copied onto another process is
    `foreign_process`), and must be the form HardKAS starts Anvil with (127.0.0.1, chain 31337): otherwise `stop`
    refuses with `L2_NODE_NOT_VERIFIED` and stops nothing.
  - On Windows the last identity check and the forced kill go through one process handle: while it is open, the PID
    cannot pass to another process. Windows has no graceful stop for it: the node is ephemeral (no `--state`).
  - On Linux and macOS the re-read and the signal are two separate steps, so a short window remains in which a PID that
    exited could be reused.
  - This lowers the risk of terminating someone else's process; it is not an absolute guarantee. The node is for local
    development only.
- A dead process leaves a `stale_record`, cleared by `stop`; a restarted HardKAS reads the same state from the record
  and the OS.
- Anvil's pre-funded accounts use its public test keys: local use only.
- `hardkas doctor l2` tells apart: Foundry not installed, Foundry altered, node off, port taken (by something that is
  not JSON-RPC, by another EVM chain, or by an EVM node HardKAS did not start), wrong chain id, and a node that runs but
  does not answer.

## Security model: what these checks are, and what they are not

The extension mechanism is **not a security boundary** and gives no isolation. An installed extension is ordinary
Node.js code: once loaded, it runs inside the CLI process with the user's permissions (files, network, keys the user can
read). The checks below reduce the chance of loading the wrong code by mistake — a package outside the first-party
catalog, another version, a link out of the project, a tampered local tarball — but they do not make a malicious
package safe to run. Install only the official `@hardkas/ext-l2`, from the registry at the CLI's version (once it is
published) or from a tarball whose SHA-256 you got from the release.

## What the CLI checks before loading it

The CLI imports this package only when the project's `package.json` declares it, the config does not disable it, it is
installed inside the project's `node_modules` (a link out of it is refused), and its name, version (the CLI's exact
version), manifest and entry are the expected ones. Otherwise its commands answer `EXTENSION_NOT_INSTALLED`,
`EXTENSION_DISABLED` or `EXTENSION_INCOMPATIBLE` (with the reason), and L1 commands are unaffected. Its commands load
`@hardkas/l2` and `viem` only when they run.

## Safety (from `@hardkas/l2`)

Every command that signs or broadcasts is chain-bound; mainnet (decided by chain id and environment, never by profile
name) needs `--allow-mainnet`; non-local networks need explicit fee ceilings (`--max-gas-limit`, `--max-fee-per-gas`,
`--max-total-fee`). See `@hardkas/l2`'s README.

## Migrating from the CLI's built-in L2 commands

| Before | Now |
|---|---|
| `HARDKAS_EXPERIMENTAL_L2=1 hardkas l2 …` | `hardkas extension install l2` (from a local build or tarballs while it is not published), then `hardkas l2 …` (the variable no longer registers anything) |
| `hardkas dev doctor` | Its L1 checks (workspace, config, artifacts, event ledger, query store, SDK, release checks) are `hardkas doctor workspace`, in the core, with the same report; its L2 checks are `hardkas l2 doctor`. `dev doctor` stays for one version as both together. |
| `hardkas local wizard` | `hardkas l2 wizard` (`local wizard` stays as an alias for one version) |
| `hardkas metamask …` (not registered since SURFACE-TRUTH-1B) | `hardkas l2 metamask …` |
| `hardkas.l2.listProfiles()` / `getProfile(name)` in `@hardkas/sdk` | `listL2Profiles()` / `getL2Profile(name)` from `@hardkas/l2`; the SDK methods throw `L2_EXTENSION_REQUIRED` |

For L1 checks, the core's diagnostics are `hardkas doctor` and `hardkas doctor workspace`.
