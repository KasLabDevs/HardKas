---
title: Execution Worlds
description: The three worlds HardKAS runs in (simulator, localnet and RPC), the ExecutionTarget that names them, and how accounts behave in each.
---

# Execution Worlds

Every HardKAS operation runs in one execution world, named by an `ExecutionTarget`: a **mode**, a **domain** and a
**network**. The world decides where UTXOs come from, who validates a transaction and what a send records. HardKAS
keeps the worlds apart: an artifact or an account made for one world is refused in another (the exact rules are in
[the execution guard](#the-execution-guard)).

Keep one distinction in mind: **the simulator is not simnet.** The simulator is HardKAS's own ledger file, with no
node. Simnet is a Kaspa network that a real `rusty-kaspad` node runs, on your machine in the localnet mode.

## The three modes

| Mode | Backend | Accounts | Funding | UTXOs | Who validates | A send records |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `simulator` | the simulated ledger, `.hardkas/localnet.json` (`@hardkas/localnet`) | `synthetic` | `init` gives alice…erin 1000 KAS each | synthetic | nobody: no node, no Kaspa script | a `TxReceipt` with a synthetic `txId` |
| `localnet` | a `rusty-kaspad` node in Docker, on simnet | `kaspa` (simnet keys) | mining, or the localnet Treasury | real, local | the local node | a `TxSubmission` |
| `rpc` | a node you configure (testnet-10, behind an opt-in) | `kaspa` or `external-wallet` | external (a faucet) | real | the network | a `TxSubmission` |

<!-- qualification: consensusValidation -->

### Simulator

- **What is real:** HardKAS's planning (the pinned `kaspa-wasm` Generator, the same planner as on a node), the
  artifacts and their schema validation.
- **What is simulated:** the UTXO set, time, the network and consensus. The ledger checks amounts and fees; it runs no
  Kaspa script and is not consensus-equivalent.
- **Lifecycle:** the ledger applies a send at once. The `TxReceipt` says `confirmed`, and `hardkas tx status` derives
  `SYNTHETIC_EXECUTED`: no Kaspa consensus was involved.
- **What it does not prove:** that a node accepts the transaction. A simulator result is never network or consensus
  evidence.
- **Replay:** `hardkas replay verify <receipt>` re-runs a simulator receipt and compares the result. It checks
  determinism, nothing about a network.

Use it for test-driven development, CI and fast iteration: it needs no Docker and no node.

### Localnet (a real node on simnet)

- **What is real:** the Kaspa node (`rusty-kaspad`), its RPC, its mempool and its consensus rules. Addresses start
  with `kaspasim:`.
- **What is not:** the network. It is one isolated node with trivial mining difficulty, so it shows nothing about
  latency, multi-node propagation or reorgs between peers.
- **Start it:** `hardkas localnet start --toccata` (needs Docker). It creates the dev accounts alice…erin. Fund an
  account with `hardkas localnet fund <identifier>` (mining to it) or from the localnet Treasury (`--treasury`).
- **Lifecycle:** `hardkas tx send` returns once the node accepts the submit request (`SUBMITTED`); nothing has been
  observed on chain yet. `hardkas tx wait <txId>`, or `tx send --wait`, waits until the transaction is `ACCEPTED` or
  `CONFIRMED` (a blue-score depth set by HardKAS's policy, not finality). In the SDK, `sdk.tx.waitForConfirmations`
  does the same.
- **Replay:** refused. `hardkas replay verify` declines a real-node send (`REPLAY_MODE_UNSUPPORTED`): the node's UTXO
  state has moved on. `hardkas verify` and `hardkas artifact verify <path>` check integrity and lineage, and
  `hardkas artifact verify <path> --network simnet --require consensus` checks the transaction on the node.

### RPC (a public testnet)

- **What is real:** everything: the node, the network, the UTXOs and consensus.
- **Opt-in:** a public testnet such as testnet-10 needs `experimental: true` and `network.allowPublic: true` in
  `hardkas.config.ts` (experimental). A broadcast outside the simulator and simnet also needs `--yes`.
- **Evidence:** a `TxSubmission` per send, with its lineage. The `txId` can be checked on a public explorer.
- **What it does not prove:** future confirmation. A transaction accepted now can still be un-accepted by a reorg
  until it is final.
- **Replay:** refused, as on localnet.

**Mainnet is locked down in this release.** HardKAS makes no connection to a mainnet node (reads included, even to an
endpoint you declare), signs nothing for it and broadcasts nothing to it (`MAINNET_CONNECTION_DISABLED`,
`MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`). No flag, option, variable or setting enables it. Mainnet
records are verified offline only. See the [security model](./security-model.md#mainnet-is-locked-down).

## The ExecutionTarget

The target is three fields (`packages/core/src/index.ts`):

- `mode`: `simulator`, `localnet` or `rpc`;
- `domain`: `kaspa-l1` or `evm-l2`;
- `network`: the network id, for example `simulated`, `simnet` or `testnet-10`.

```ts
import type { HardkasExecutionTarget } from "@hardkas/core";

export const target: HardkasExecutionTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };
```

Everything in this guide is the `kaspa-l1` domain. The schema reserves `evm-l2`, and a Kaspa account is refused there
(`EXECUTION_DOMAIN_MISMATCH`). The Igra L2 lab is the experimental `l2` extension, which is not published in this
release ([not published](../status/versioning.md#not-published)). Kaspa L1 executes no EVM code.

`hardkas init` writes two named targets and makes the simulator the default:

```ts
// hardkas.config.ts as `hardkas init` writes it (excerpt: it also writes network, artifacts, experimental and networks)
export default {
  execution: {
    default: "simulator",
    targets: {
      simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
      localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }
    }
  }
};
```

A command resolves its target once: `--target <name>` (a name from `execution.targets`), else `--network <name>`, else
`execution.default`. The SDK resolves it the same way when `Hardkas.open()` runs, and every part of the instance
(its provider, accounts, plans and observers) follows that one target.

## The execution guard

A plan, a signed transaction and a receipt record the target they were made under (their `execution` field). Before
signing, sending or replaying, HardKAS compares it with the target of the command (`assertExecutionCompatibility` in
`@hardkas/core`) and refuses a mismatch:

- another domain or another network: always refused (`EXECUTION_DOMAIN_MISMATCH`, `EXECUTION_NETWORK_MISMATCH`);
- the simulator against a node world, either way: refused (`EXECUTION_MODE_MISMATCH`);
- localnet against rpc on the same network: a send and an account lookup are allowed; anything else is refused
  (`EXECUTION_COMPATIBILITY_UNDEFINED`).

An artifact written before artifacts recorded their target has no `execution` field, and the guard lets it through.

Accounts are checked too. A signer must hold authority in the target's world: a `synthetic` account signs only in the
simulator, and on localnet the signer must be a `kaspa` account of the target's network. A recipient needs no signing
authority: on a node world, an `external-wallet` address can be funded, while a `synthetic` identity is refused there.

## Accounts in each world

HardKAS keeps four ideas apart:

- **Address:** a bech32-style string with a network prefix (`kaspa:`, `kaspatest:`, `kaspasim:`), for a public key or a
  script. Knowing an address does not mean holding its key.
- **Private key:** the secret that signs for an address. It lives in an encrypted keystore in `.hardkas/keystore/`, in
  plain text when you ask for it, or outside HardKAS entirely (an external wallet).
- **Account:** a name (`alice`) that HardKAS resolves, in the current world, to an address and, when it can, a way to
  sign. The same name resolves differently in the simulator and on simnet.
- **Wallet:** a stateful layer over an address (balances, UTXOs, multi-step payments). See [Accounts](./accounts.md).

An account has one of three kinds:

- `kaspa`: a real key that HardKAS holds (a keystore, or a plaintext key).
- `synthetic`: a simulator identity. In the simulator, the account layer names alice…erin `kaspa:sim_alice` and so on;
  the simulated ledger records their UTXOs under each account's `kaspasim:` address and maps one name to the other. The
  UTXOs are synthetic: no node validates them.
- `external-wallet`: an address HardKAS can plan for and fund, but whose key it does not hold. That key signs outside
  HardKAS, or through a [browser wallet](../start/browser-wallets.md) (experimental). This build cannot export a PSKT.

When you run `hardkas tx plan --from alice`, HardKAS resolves the target first, then looks `alice` up in that world: the
synthetic identity in the simulator, the simnet dev account (a `kaspa` account with a `kaspasim:` address) on
localnet. It gets an address (to read UTXOs) and, for signing later, the key. Planning needs no key: `--from` also takes
a bare address.

| | Simulator | Localnet (simnet) | Testnet-10 (opt-in) |
| :-- | :-- | :-- | :-- |
| **Account kind** | `synthetic` | `kaspa` | `kaspa` or `external-wallet` |
| **Address** | `kaspa:sim_<name>`, mapped to a `kaspasim:` ledger address | `kaspasim:` | `kaspatest:` |
| **Key** | none: a simulator signature is a synthetic authorization bound to the plan | deterministic dev keys (alice…erin, public by design), or accounts you create | an encrypted keystore, or a key held by an external wallet |
| **Funding** | the simulated ledger | mining (`localnet fund`) or the localnet Treasury | a faucet or other external funds |
| **Signing** | synthetic | local keystore or plaintext key | local keystore, or a browser wallet (experimental) |
| **Balances from** | `.hardkas/localnet.json` | the local node | the configured node |

Mainnet is locked down: no keys, no connection, no broadcast.

The [quickstart](../start/quickstart.md) runs the simulator end to end, and [What works](../start/what-works.md)
lists what each world has been checked against.
