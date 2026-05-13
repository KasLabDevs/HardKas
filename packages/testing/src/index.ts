import { Hardkas } from "@hardkas/sdk";
import { NetworkId } from "@hardkas/core";
import { beforeAll, afterAll, beforeEach } from "vitest";

/**
 * HardKAS Testing Runtime
 */
export interface HardkasTestRuntime {
  readonly hardkas: Hardkas;
  readonly network: NetworkId;
  readonly accounts: Hardkas["accounts"];
  readonly tx: Hardkas["tx"];
  readonly localnet: Hardkas["localnet"];
  readonly query: Hardkas["query"];
}

export interface HardkasTestOptions {
  cwd?: string;
  network?: NetworkId;
  autoStartLocalnet?: boolean;
  resetBetweenTests?: boolean;
}

/**
 * The main helper for HardKAS tests.
 * Injects hooks for Vitest and provides access to the SDK.
 */
export function hardkasTest(options: HardkasTestOptions = {}): HardkasTestRuntime {
  const cwd = options.cwd || process.env.HARDKAS_CWD || ".";
  const network = options.network || (process.env.HARDKAS_NETWORK as NetworkId) || "simnet";
  const autoStart = options.autoStartLocalnet ?? true;
  const autoReset = options.resetBetweenTests ?? true;

  let sdk: Hardkas;

  // Hooks
  beforeAll(async () => {
    sdk = await Hardkas.open(cwd);
    
    if (autoStart && network === "simnet") {
      await sdk.localnet.start();
    }
  });

  beforeEach(async () => {
    if (autoReset && network === "simnet") {
      await (sdk.localnet as any).reset();
    }
  });

  // We return a proxy because the SDK is initialized in beforeAll
  return {
    get hardkas() { return sdk; },
    get network() { return network; },
    get accounts() { return sdk.accounts; },
    get tx() { return sdk.tx; },
    get localnet() { return sdk.localnet; },
    get query() { return sdk.query; }
  };
}

// Backward compatibility or legacy mocks
export * from "./invariants.js";
export * from "./utxo-fuzzer.js";
