---
title: Configuration
description: What hardkas.config.ts declares - execution targets, networks and their kinds, the public-testnet opt-in - and how a command picks where it runs.
---

# Configuration

HardKAS reads one configuration file per workspace: `hardkas.config.ts` (or
`.mts`, `.js`, `.mjs`), the nearest one at or above the current directory. The
global `--workspace <path>` option starts that search somewhere else. The fields
a config leaves out are filled from HardKAS's built-in defaults, and its
`networks` are merged over the built-in ones.

## What `hardkas init` writes

This is the file `hardkas init` writes (its version comment left out):

```typescript
// HardKAS configuration. It imports nothing, so it loads before any dependency is installed.
// For editor types, wrap the object with defineHardkasConfig from "@hardkas/sdk" once it is installed.
export default {
  execution: {
    default: "simulator",
    targets: {
      simulator: {
        mode: "simulator",
        domain: "kaspa-l1",
        network: "simulated"
      },
      localnet: {
        mode: "localnet",
        domain: "kaspa-l1",
        network: "simnet"
      }
    }
  },

  // Strict execution policy
  network: {
    allowPublic: false
  },
  artifacts: {
    deterministic: true
  },
  experimental: false,

  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation — no Docker, no RPC, no node"
    },

    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210",
      description: "Local Docker kaspad on simnet — requires hardkas localnet start --toccata"
    }
  }
};
```

The object imports nothing, so the config loads before `npm install` and under a
globally installed CLI. Once `@hardkas/sdk` is installed you can wrap it for
editor types; the content stays the same:

```typescript
import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  execution: {
    default: "simulator",
    targets: {
      simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
      localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }
    }
  },
  network: { allowPublic: false },
  artifacts: { deterministic: true },
  experimental: false,
  networks: {
    simulated: { kind: "simulated" },
    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:18210" }
  }
});
```

`npx hardkas config init` writes a smaller config into the current directory
(the simulator target only), and `npx hardkas config repair` replaces a config
that does not load with that minimal one, after copying the old file to a
backup that never overwrites another. When a folder holds several
`hardkas.config.*` files, the loader takes the first of `.ts`, `.mts`, `.js`,
`.mjs`.

## Execution targets

`execution.targets` names the places a command can run; `execution.default` is
the one used when a command names none. Each target has three fields:

| Field | Values |
| :-- | :-- |
| `mode` | `simulator` (the simulated ledger), `localnet` (a local node: simnet or devnet) or `rpc` (any other node) |
| `domain` | `kaspa-l1`. (`evm-l2` exists for the Igra L2 extension, which is not published.) |
| `network` | a key of `networks` |

A command picks its target in this order:

- `--target <name>` (SDK: `Hardkas.create({ target })`) selects a named target.
- `--network <name>` (SDK: `Hardkas.create({ network })`) selects a network. A
  target that names that network is used; otherwise the mode the network implies
  (`simulated` → simulator, `simnet` or `devnet` → localnet, any other → rpc).
- Neither: `execution.default`.

Given both, they must agree (`EXECUTION_NETWORK_MISMATCH`). An unknown name is
refused (`EXECUTION_TARGET_NOT_FOUND`, `UNKNOWN_NETWORK`); HardKAS never falls
back to the simulator. A signed artifact is always sent where its plan says:
`tx send --target` must match it and never redirects the send.

## Networks

`networks` declares the networks by name. The built-in ones are `simulated`,
`simnet` (`ws://127.0.0.1:18210`, the managed localnet), `devnet`
(`ws://127.0.0.1:18610`), `testnet-10`, `testnet-11` and `mainnet`; an entry of
yours with the same name replaces the built-in one. Each entry has a `kind`:

| `kind` | Fields | What it is |
| :-- | :-- | :-- |
| `simulated` | `description` | The simulated ledger in `.hardkas/localnet.json`: offline and deterministic, no node, never network evidence. |
| `kaspa-node` | `network`, `rpcUrl`, `description`, `maxFeeSompi`, `maxFeeRate` | A `rusty-kaspad` node reached at `rpcUrl` (wRPC, JSON encoding). `network` is the Kaspa network the node must serve: `simnet`, `devnet`, `testnet-10`, `testnet-12`, … |
| `kaspa-rpc` | `network`, `rpcUrl` (required), `description`, `maxFeeSompi`, `maxFeeRate` | The same, reached only through its endpoint. The built-in public networks are of this kind. |
| `igra` | `chainId`, `rpcUrl` | An Igra L2 network, used only by the L2 extension, which is not published. |

- **Endpoints.** `--url <ws://…>` overrides a network's `rpcUrl` for one command.
  The built-in public networks carry no endpoint: declare the `rpcUrl` of a node
  you choose, or pass `--url`; otherwise the command refuses before connecting
  (`NETWORK_ENDPOINT_REQUIRED`). To use a simnet node of your own, change
  `networks.simnet.rpcUrl`
  ([Run your own simnet node](./simnet-node.md#4-point-the-workspace-at-the-node)).
- **Fee limits.** `maxFeeSompi` caps the total fee of a transaction on that
  network, checked at plan, sign and send. `maxFeeRate` is the highest fee rate
  (sompi per gram) accepted from the node's estimate; above it the plan is
  refused (`FEE_RATE_ABOVE_BOUND`).

## A public testnet

A public testnet (testnet-10) needs two settings together: `experimental: true`
and `network: { allowPublic: true }`. `allowPublic` without `experimental` is
refused when the config loads (`HARDKAS_CONFIG_ERROR`). For example, to make
testnet-10 the default target:

```ts
export default {
  execution: { default: "tn10", targets: { tn10: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
  networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "<your Testnet-10 node>" } },
  network: { allowPublic: true },
  experimental: true
};
```

The whole Testnet-10 path (account, funding, send, browser wallets) is in [Kaspa Testnet-10](testnet-10.md).

Use test funds only. **Mainnet is locked down whatever the config says:** no
connection, reads included (`MAINNET_CONNECTION_DISABLED`), no signing, no
broadcast; `allowPublic` does not lift it.

## Other fields

| Field | What it does |
| :-- | :-- |
| `artifacts.deterministic` | `true` by default. `false` is refused without `experimental: true` (`HARDKAS_CONFIG_ERROR`). |
| `accounts` | Optional named accounts. `init` declares none: the dev accounts are resolved by name. |
| `tasks`, `plugins` | Custom tasks and plugins ([Tasks](../guides/tasks.md), [Plugins](../guides/plugins.md)). |
| `defaultNetwork` | Deprecated: a config that still uses it instead of `execution` gets a warning. Use `execution`. |

## Check what the workspace declares

```bash
npx hardkas config show
npx hardkas config networks
npx hardkas doctor
```

`config show` prints the configuration as loaded (defaults included),
`config networks` lists the declared networks, and `doctor` checks the local
setup and, when the workspace's network declares a node, asks that node once.
