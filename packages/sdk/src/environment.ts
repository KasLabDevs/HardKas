import type { HardkasConfig } from "@hardkas/config";
import type { HardkasOptions } from "./index.js";
import { createHardkasClient } from "./client.js";

export type HardkasMode = "agent" | "script" | "test";
export type Policy = Required<NonNullable<HardkasOptions["policy"]>>;

// Use the return type of the existing client to construct our interfaces
type ClientShape = ReturnType<typeof createHardkasClient>;

export interface HardkasEnvironment {
  /** The currently loaded HardKAS configuration. */
  config: HardkasConfig;
  
  /** The root directory of the workspace where the config was found. */
  workspaceRoot: string;
  
  /** The execution mode of the environment. */
  mode: HardkasMode;
  
  /** The evaluated policy constraints for the environment. */
  policy: Policy;

  /** Accounts API: list, resolve, balance, fund (localnet), etc. */
  accounts: ClientShape["accounts"];
  
  /** Localnet API: status, start, stop, etc. */
  localnet: ClientShape["localnet"];
  
  /** Transaction API: plan, sign, send, receipt */
  tx: ClientShape["tx"];
  
  /** Artifacts API: explain, replay, watch */
  artifacts: ClientShape["artifacts"];
  
  /** Query API for querying the read model (stubbed from client if missing, or added) */
  query: any; // We'll refine this as we go
  
  /** Replay / Session API */
  replay: ClientShape["session"];
  
  /**
   * The vitest `expect` function. 
   * Available for convenience inside scenarios (e.g. `hk.expect(a).toBe(b)`).
   */
  expect: any;
}

export interface HardkasEnvironmentOptions {
  config: HardkasConfig;
  workspaceRoot: string;
  mode: HardkasMode;
  policy: Policy;
  baseUrl?: string;
  network?: string;
  // A mechanism to inject `expect` from the test framework
  expectFn?: any;
}

/**
 * Creates the global HardKAS Environment (`hk`).
 */
export function createHardkasEnvironment(options: HardkasEnvironmentOptions): HardkasEnvironment {
  const clientOpts: any = {
    network: options.network || options.config.defaultNetwork || "simulated"
  };
  if (options.baseUrl !== undefined) {
    clientOpts.baseUrl = options.baseUrl;
  }
  const client = createHardkasClient(clientOpts);

  return {
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    mode: options.mode,
    policy: options.policy,

    accounts: client.accounts,
    localnet: client.localnet,
    tx: client.tx,
    artifacts: client.artifacts,
    
    // We add a stub for query if the client doesn't have it yet,
    // or map it if it does.
    query: (client as any).query || {},
    
    replay: client.session,
    
    // Dummy expect that throws if used outside of a test scenario
    expect: options.expectFn || function() {
      throw new Error("hk.expect is only available within a vitest scenario execution.");
    }
  };
}
