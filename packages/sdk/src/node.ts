import { Hardkas } from "./index.js";
import { HardkasError, getCoinbaseMaturity } from "@hardkas/core";
import { DockerKaspadRunner, KaspadNodeStatus } from "@hardkas/node-runner";

export interface HardkasNodeStartOptions {
  /**
   * The network to start the node on. Defaults to 'simnet'.
   */
  readonly network?: "simnet" | "testnet-10" | "testnet-11" | "devnet";
  /**
   * Address to mine blocks to. If provided, the internal CPU miner will be enabled.
   */
  readonly mineTo?: string | undefined;
  /**
   * If true, resets the node (wiping the data directory) before starting.
   */
  readonly reset?: boolean;
}

export class HardkasNodeApi {
  private runner: DockerKaspadRunner | null = null;

  constructor(private readonly sdk: Hardkas) {}

  private getRunner(options?: HardkasNodeStartOptions): DockerKaspadRunner {
    if (!this.runner) {
      const network = options?.network || (this.sdk.network === "simulated" ? "simnet" : (this.sdk.network as any));
      
      this.runner = new DockerKaspadRunner({
        cwd: this.sdk.cwd,
        network: network,
        mineTo: options?.mineTo,
        // Default to deterministic ports if not specified by env
      });
    }
    return this.runner;
  }

  /**
   * Starts the local Kaspa node via Docker.
   * Only applicable for non-mainnet environments.
   * Throws `DOCKER_UNAVAILABLE` if docker is missing.
   * Throws `NODE_MANAGEMENT_MAINNET_FORBIDDEN` if attempted on mainnet.
   */
  public async start(options?: HardkasNodeStartOptions): Promise<KaspadNodeStatus> {
    if (this.sdk.network === "mainnet") {
      throw new HardkasError(
        "NETWORK_ACCOUNT_MISMATCH",
        "[NODE_MANAGEMENT_MAINNET_FORBIDDEN] Cannot programmatically start a mainnet node."
      );
    }

    // Since options could change, we might need to recreate the runner if network/mineTo changes
    // But for simplicity, we assume one runner per SDK instance, or we recreate it.
    if (options) {
        const network = options.network || (this.sdk.network === "simulated" ? "simnet" : (this.sdk.network as any));
        this.runner = new DockerKaspadRunner({
            cwd: this.sdk.cwd,
            network: network,
            mineTo: options.mineTo,
        });
    }

    const runner = this.getRunner(options);

    if (options?.reset) {
      await runner.reset();
    }

    try {
      return await runner.start();
    } catch (e: any) {
      if (e.message && e.message.includes("DOCKER_UNAVAILABLE")) {
        throw new Error(e.message);
      }
      if (e.message && e.message.includes("NODE_MANAGEMENT_MAINNET_FORBIDDEN")) {
        throw new Error(e.message);
      }
      throw e;
    }
  }

  /**
   * Stops the currently running local Kaspa node.
   */
  public async stop(): Promise<KaspadNodeStatus> {
    const runner = this.getRunner();
    return await runner.stop();
  }

  /**
   * Hard resets the local Kaspa node, permanently wiping its data directory.
   */
  public async reset(): Promise<KaspadNodeStatus> {
    const runner = this.getRunner();
    return await runner.reset({ removeData: true });
  }

  /**
   * Gets the current status and health of the local Kaspa node.
   */
  public async status(): Promise<KaspadNodeStatus> {
    const runner = this.getRunner();
    return await runner.status();
  }

  /**
   * Retrieves the recent logs from the local Kaspa node container.
   */
  public async logs(options?: { tail?: number; follow?: boolean }): Promise<string | void> {
    const runner = this.getRunner();
    return await runner.logs(options);
  }

  /**
   * High-level helper to fund a list of dev wallets on simnet.
   * Starts the node (if not running), sets it to mine to the first wallet.
   * Resolves when the first wallet has at least one **mature** UTXO
   * (coinbase maturity period satisfied).
   */
  public async fundDevWallets(
    wallets: string[],
    options?: FundDevWalletsOptions
  ): Promise<void> {
    if (wallets.length === 0) return;
    
    const primaryInput = wallets[0];
    if (!primaryInput) return;
    
    const timeoutMs = options?.timeoutMs ?? 180_000;
    
    const activeNetwork = this.sdk.network;
    const networkConfig = this.sdk.config.config.networks?.[activeNetwork];
    const defaultMaturity = getCoinbaseMaturity(activeNetwork, networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined);
    const coinbaseMaturity = options?.coinbaseMaturity ?? defaultMaturity;
    
    // Resolve alias to address
    let primaryAddress = primaryInput;
    if (!primaryInput.startsWith("kaspa:") && !primaryInput.startsWith("kaspasim:") && !primaryInput.startsWith("kaspatest:") && !primaryInput.startsWith("kaspadev:")) {
      try {
        const wallet = await this.sdk.wallet.open(primaryInput);
        primaryAddress = await wallet.receive();
      } catch (err: any) {
        throw new Error(`INVALID_WALLET_ALIAS: Failed to resolve alias '${primaryInput}' to an address. ${err.message}`);
      }
    }
    
    if (!primaryAddress.startsWith("kaspasim:") && this.sdk.network === "simnet") {
      throw new Error(`INVALID_KASPA_ADDRESS: Expected a kaspasim: address for simnet, but got '${primaryAddress}'`);
    }
    
    const status = await this.status();
    if (!status.running) {
      // Start it with mining enabled to the first wallet
      await this.start({ mineTo: primaryAddress });
    } else {
      // Node is already running — ensure a miner sidecar is attached
      const { exec: execCb } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(execCb);
      const minerName = "hardkas-kaspad-simnet-miner";
      try { await execAsync(`docker rm -f ${minerName}`); } catch {}
      try {
        await execAsync(
          `docker run -d --name ${minerName} ` +
          `--network container:hardkas-kaspad-simnet ` +
          `kaspanet/cpuminer:latest ` +
          `-a ${primaryAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`
        );
      } catch (err: any) {
        throw new HardkasError("MINER_NOT_RUNNING", `Failed to start miner sidecar: ${err.message}`, { cause: err });
      }
    }

    // Wait for the RPC to be ready and at least one MATURE UTXO to appear.
    const start = Date.now();
    let funded = false;

    while (Date.now() - start < timeoutMs) {
      try {
        const utxos = await this.sdk.rpc.getUtxosByAddress(primaryAddress);
        const dagInfo = await this.sdk.rpc.getBlockDagInfo();
        const virtualDaaScore = dagInfo.virtualDaaScore ?? 0n;
        
        const matureUtxos = utxos.filter(u =>
          !u.isCoinbase ||
          (u.blockDaaScore !== undefined && (virtualDaaScore - BigInt(u.blockDaaScore)) >= coinbaseMaturity)
        );
        
        if (matureUtxos.length > 0) {
          funded = true;
          break;
        }
      } catch {
        // RPC might not be ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!funded) {
      throw new Error(
        `MINING_TIMEOUT: Failed to fund dev wallets within ${Math.round(timeoutMs / 1000)} seconds. ` +
        `Coinbase maturity requires ${coinbaseMaturity} DAA blocks. Miner may need more time.`
      );
    }
  }

  /**
   * Pauses the local cpuminer container, useful for stabilizing the mempool before testing transactions.
   */
  public async pauseMining(): Promise<void> {
    const { exec } = await import("child_process");
    const util = await import("util");
    const execAsync = util.promisify(exec);

    try {
      await execAsync("docker pause hardkas-kaspad-simnet-miner");
    } catch (e: any) {
      throw new HardkasError("MINER_NOT_RUNNING", `Failed to pause miner: ${e.message}`, { cause: e });
    }
  }

  /**
   * Resumes the local cpuminer container if it was previously paused.
   */
  public async resumeMining(): Promise<void> {
    const { exec } = await import("child_process");
    const util = await import("util");
    const execAsync = util.promisify(exec);

    try {
      await execAsync("docker unpause hardkas-kaspad-simnet-miner");
    } catch (e: any) {
      throw new HardkasError("MINER_RESUME_FAILED", `Failed to resume miner: ${e.message}`, { cause: e });
    }
  }

  /**
   * Waits for the network to settle by taking periodic snapshots of the virtual DAA score 
   * and ensuring it remains stable or advances gracefully over the required samples.
   */
  public async waitForSettlement(options?: {
    stableSamples?: number;
    intervalMs?: number;
    timeoutMs?: number;
    addresses?: string[];
  }): Promise<{ settled: boolean; evidence: string; samples: number }> {
    const stableSamples = options?.stableSamples ?? 3;
    const intervalMs = options?.intervalMs ?? 1000;
    const timeoutMs = options?.timeoutMs ?? 30000;

    let previousDaa = -1n;
    let stableCount = 0;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const info = await this.sdk.rpc.getBlockDagInfo();
        const currentDaa = info.virtualDaaScore ?? 0n;

        if (currentDaa === previousDaa) {
          stableCount++;
          if (stableCount >= stableSamples) {
            return {
              settled: true,
              evidence: "stable-rpc-snapshot",
              samples: stableCount
            };
          }
        } else {
          stableCount = 1;
          previousDaa = currentDaa;
        }
      } catch (e) {
        stableCount = 0;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new HardkasError("SETTLEMENT_TIMEOUT", "Mempool and DAG failed to settle within the timeout.");
  }
}

export interface FundDevWalletsOptions {
  /** Maximum time to wait for mature UTXOs in milliseconds. Defaults to 180_000 (3 minutes). */
  readonly timeoutMs?: number;
  /** Coinbase maturity period in DAA blocks. Defaults to 1000. */
  readonly coinbaseMaturity?: bigint;
}
