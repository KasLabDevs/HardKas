import { Hardkas } from "../index.js";
import { resolveObserverBackend } from "./backends.js";
import {
  AddressObservationSnapshot,
  HardkasObserveAddressOptions,
  HardkasObserveWaitOptions,
  HardkasObserveWatchOptions
} from "./types.js";
import { ARTIFACT_SCHEMAS, calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

export class HardkasObserve {
  constructor(private sdk: Hardkas) {}

  /**
   * Fetches a one-shot observation of a Kaspa address (mempool + UTXOs).
   */
  async address(options: HardkasObserveAddressOptions): Promise<AddressObservationSnapshot> {
    const target = options.target || this.sdk.config.config.defaultNetwork || "simnet";
    const networkConfig = this.sdk.config.config.networks?.[target];
    
    if (options.target && !networkConfig && target !== "simnet" && target !== "mainnet" && target !== "testnet") {
      const error = new Error(`OBSERVATION_UNKNOWN_TARGET: Unknown execution target '${options.target}'`);
      (error as any).code = "OBSERVATION_UNKNOWN_TARGET";
      throw error;
    }

    const allowMainnet = (this.sdk.config.config.networks?.mainnet as any)?.allowMainnet === true;
    
    try {
      const { validateAddressNetwork } = await import("@hardkas/accounts");
      validateAddressNetwork(options.address, target, allowMainnet);
    } catch (e: any) {
      if (e.message?.includes("Network mismatch")) {
        const error = new Error(`EXECUTION_CONTRACT_MISMATCH: Address ${options.address} is incompatible with target ${target}`);
        (error as any).code = "EXECUTION_CONTRACT_MISMATCH";
        throw error;
      }
      throw e;
    }

    const backend = resolveObserverBackend(this.sdk, target);
    const snapshot = await backend.observeAddress(options.address);

    if (options.produceArtifact) {
      await this.persistArtifact(snapshot);
    }

    return snapshot;
  }

  /**
   * Watches an address for changes using an AsyncIterableIterator.
   */
  async *watchAddress(options: HardkasObserveWatchOptions): AsyncIterableIterator<AddressObservationSnapshot> {
    const pollInterval = options.pollIntervalMs || 1000;
    const policy = options.artifactPolicy || "changes";
    let lastFingerprint: string | undefined = undefined;

    while (true) {
      if (options.signal?.aborted) {
        break;
      }

      try {
        const snapshot = await this.address({ address: options.address, ...(options.target ? { target: options.target } : {}) });
        
        let shouldProduceArtifact = policy === "all";
        let shouldYield = policy === "all" || policy === "none"; // if none/all, always yield
        
        if (policy === "changes") {
          const fingerprint = this.computeFingerprint(snapshot);
          if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint;
            shouldProduceArtifact = true;
            shouldYield = true;
          }
        }

        if (shouldProduceArtifact) {
          await this.persistArtifact(snapshot);
        }

        if (shouldYield) {
          yield snapshot;
        }

      } catch (err: any) {
        if (err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED")) {
          const error = new Error("RPC node is unavailable.");
          (error as any).code = "OBSERVATION_RPC_UNAVAILABLE";
          throw error;
        }
        throw err;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Waits for a specific condition on the address observation to be met.
   */
  async waitForAddress(options: HardkasObserveWaitOptions): Promise<AddressObservationSnapshot> {
    const timeoutMs = options.timeoutMs || 120_000;
    
    // We create our own abort controller to handle timeout
    const controller = new AbortController();
    let parentAbortHandler: (() => void) | undefined;
    
    if (options.signal) {
      parentAbortHandler = () => controller.abort();
      options.signal.addEventListener("abort", parentAbortHandler);
      if (options.signal.aborted) {
        controller.abort();
      }
    }

    const timeoutId = setTimeout(() => {
      controller.abort(new Error("Timeout waiting for observation predicate."));
    }, timeoutMs);

    try {
      for await (const snapshot of this.watchAddress({
        ...options,
        signal: controller.signal
      })) {
        if (options.predicate(snapshot)) {
          clearTimeout(timeoutId);
          return snapshot;
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError" || e.message?.includes("Timeout")) {
        const error = new Error(e.message || "Timeout waiting for address state");
        (error as any).code = "OBSERVATION_TIMEOUT";
        throw error;
      }
      throw e;
    } finally {
      if (options.signal && parentAbortHandler) {
        options.signal.removeEventListener("abort", parentAbortHandler);
      }
    }

    throw new Error("Observation ended without meeting predicate");
  }

  private computeFingerprint(snapshot: AddressObservationSnapshot): string {
    // We exclude observedAt to only trigger on semantic state changes
    const { observedAt, ...rest } = snapshot;
    // Simple deterministic stringification
    return JSON.stringify(rest, (key, value) =>
      typeof value === 'bigint'
        ? value.toString()
        : value // return everything else unchanged
    );
  }

  private async persistArtifact(snapshot: AddressObservationSnapshot): Promise<void> {
    const artifactData = {
      schema: ARTIFACT_SCHEMAS.ADDRESS_OBSERVATION || "hardkas.observation.address.v1",
      type: "address_observation",
      execution: snapshot.execution,
      address: snapshot.address,
      mempool: snapshot.mempool,
      utxos: snapshot.utxos,
      totals: {
        mempoolIncomingSompi: snapshot.totals.mempoolIncomingSompi.toString(),
        acceptedUtxoSompi: snapshot.totals.acceptedUtxoSompi.toString()
      },
      virtual: {
        daaScore: snapshot.virtual.daaScore?.toString()
      },
      observedAt: snapshot.observedAt.toISOString(),
      networkId: snapshot.execution.network,
      mode: snapshot.execution.mode,
      hardkasVersion: "0.12.0-rc.12", // We should import HARDKAS_VERSION ideally
      version: "1.0.0-alpha",
      createdAt: new Date().toISOString()
    };

    // Cast it to any because the exact schema requires base fields
    const { writeArtifact } = await import("@hardkas/artifacts");
    
    // Hash it for lineage
    const contentHash = calculateContentHash(artifactData, CURRENT_HASH_VERSION);
    (artifactData as any).contentHash = contentHash;

    await writeArtifact(artifactData as any, { 
      cwd: this.sdk.workspace.root,
      dryRun: false 
    });
  }
}
