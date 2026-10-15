import type { HardkasConfig } from "./types";
import { CANONICAL_LOCALNET } from "@hardkas/core";

/**
 * The built-in configuration: what a workspace without hardkas.config.ts runs with, and what fills
 * the fields a hardkas.config.ts leaves out (see load.ts).
 *
 * PAPERCUTS #37: the built-in default target is declared through the `execution` contract (the
 * simulator, with the canonical localnet as a named target), never through the deprecated
 * `defaultNetwork`. The `defaultNetwork` below is only the mirror of that default for the SDK and
 * CLI paths that still read the legacy key (`config.defaultNetwork || …`): it is not a declaration,
 * the resolver never warns about it (an execution target is always present), and it goes away once
 * those readers follow the resolved execution target.
 */
export const DEFAULT_HARDKAS_CONFIG: HardkasConfig = {
  execution: {
    default: "simulator",
    targets: {
      simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
      localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" }
    }
  },
  /** Legacy mirror of `execution.targets[execution.default].network`; see the note above. */
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation — no Docker, no RPC, no node"
    },
    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      // CANONICAL-RPC-URL: the canonical localnet endpoint from @hardkas/core (a plain constant,
      // safe before kaspa-wasm is installed), never a copy.
      rpcUrl: `ws://${CANONICAL_LOCALNET.host}:${CANONICAL_LOCALNET.ports.jsonRpc}`,
      description: "Local Docker kaspad on simnet — requires hardkas node start"
    },
    devnet: {
      kind: "kaspa-node",
      network: "devnet",
      // The SDK's default devnet wRPC (JSON) port. These defaults are built on import,
      // possibly before kaspa-wasm is installed, so a test pins it to the SDK instead.
      rpcUrl: "ws://127.0.0.1:18610"
    },
    // TESTNET-PORT-COLLISION-1 (D-TPC-2): the public networks are known by name, but carry NO endpoint: HardKAS never
    // picks a node of a public network for the user (neither a third-party public host nor a local default port). The
    // user declares `rpcUrl` (their own node, or a public node they select) or passes --url; otherwise every client
    // path refuses NETWORK_ENDPOINT_REQUIRED (@hardkas/config resolveNodeEndpoint). Empty, never a URL, by construction.
    "testnet-10": {
      kind: "kaspa-rpc",
      network: "testnet-10",
      rpcUrl: ""
    },
    "testnet-11": {
      kind: "kaspa-rpc",
      network: "testnet-11",
      rpcUrl: ""
    },
    mainnet: {
      kind: "kaspa-rpc",
      network: "mainnet",
      rpcUrl: ""
    }
  },
  accounts: {}
};
