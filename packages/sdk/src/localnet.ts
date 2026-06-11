import { Hardkas } from "./index.js";
import { execFileSync } from "node:child_process";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface LocalnetProfileOptions {
  profile?: "simulated" | "toccata-v2" | string;
}

export interface LocalnetStatusResult {
  schema: typeof HardkasSchemas.LocalnetStatusV1;
  profile: string;
  node: {
    ready: boolean;
    rpcUrl: string;
    networkId?: string;
    serverVersion?: string;
    isSynced?: boolean;
    virtualDaaScore?: string;
    lastError?: string;
  };
  miner: {
    exists: boolean;
    running: boolean;
    status: string;
    image: string;
    name: string;
  };
  simulationLevels: {
    artifactCoherence: "READY";
    runtimeOutcome: "PARTIAL";
    vmConsensusEquivalence: "NOT_CLAIMED";
  };
}

export interface LocalnetControlResult {
  schema: typeof HardkasSchemas.LocalnetControlV1;
  profile: string;
  status: "SIMULATED_LOCALNET_READY" | "SDK_LOCALNET_CONTROL_UNSUPPORTED";
  message: string;
}

export interface LocalnetFundingResult {
  schema: typeof HardkasSchemas.LocalnetFundingV1;
  profile: string;
  identifier: string;
  status: "SIMULATED_ACCOUNT_FUNDED" | "SDK_TOCCATA_FUNDING_UNSUPPORTED";
  receipt?: unknown;
  message: string;
}

/**
 * HardKAS Localnet Simulation Module
 */
export class HardkasLocalnet {
  constructor(private sdk: Hardkas) {}

  /**
   * Status check for the localnet simulation.
   */
  async isAlive(): Promise<boolean> {
    try {
      const info = await this.sdk.rpc.getInfo();
      return info.isSynced === true;
    } catch {
      return false;
    }
  }

  /**
   * Status check with the same claim boundaries as `hardkas localnet status --json`.
   */
  async status(options: LocalnetProfileOptions = {}): Promise<LocalnetStatusResult> {
    const profile = options.profile || "toccata-v2";
    const node = await this.detectToccataNode();
    return {
      schema: HardkasSchemas.LocalnetStatusV1,
      profile,
      node,
      miner: this.inspectDockerContainer("hardkas-toccata-stratum-v2"),
      simulationLevels: {
        artifactCoherence: "READY",
        runtimeOutcome: "PARTIAL",
        vmConsensusEquivalence: "NOT_CLAIMED"
      }
    };
  }

  /**
   * Initializes the in-memory simulated workspace.
   *
   * Docker Toccata process control remains a CLI/localnet responsibility in
   * 0.9.6-alpha; the SDK reports that boundary instead of silently shelling out.
   */
  async start(options: LocalnetProfileOptions = {}): Promise<LocalnetControlResult> {
    const profile = options.profile || "simulated";
    if (profile === "simulated") {
      const { loadOrCreateLocalnetState } = await import("@hardkas/localnet");
      await loadOrCreateLocalnetState({ cwd: this.sdk.cwd });
      return {
        schema: HardkasSchemas.LocalnetControlV1,
        profile,
        status: "SIMULATED_LOCALNET_READY",
        message: "Simulated localnet state is ready."
      };
    }

    return {
      schema: HardkasSchemas.LocalnetControlV1,
      profile,
      status: "SDK_LOCALNET_CONTROL_UNSUPPORTED",
      message:
        "SDK Docker localnet start is not supported in 0.9.6-alpha. Use `hardkas localnet start --profile toccata-v2`."
    };
  }

  /**
   * Funds a simulated account through the SDK transaction flow.
   *
   * Toccata Docker mining/funding remains CLI-only in 0.9.6-alpha because it
   * depends on a local stratum/miner companion and host Docker state.
   */
  async fund(
    identifier: string,
    options: LocalnetProfileOptions & { from?: string; amount?: string | bigint } = {}
  ): Promise<LocalnetFundingResult> {
    const profile =
      options.profile || (this.sdk.network === "simulated" ? "simulated" : "toccata-v2");
    if (profile === "simulated") {
      const fundOptions: { from?: string; amount?: string | bigint } = {};
      if (options.from !== undefined) fundOptions.from = options.from;
      if (options.amount !== undefined) fundOptions.amount = options.amount;
      const receipt = await this.sdk.accounts.fund(identifier, fundOptions);
      return {
        schema: HardkasSchemas.LocalnetFundingV1,
        profile,
        identifier,
        status: "SIMULATED_ACCOUNT_FUNDED",
        receipt,
        message: "Simulated account funded through SDK transaction simulation."
      };
    }

    return {
      schema: HardkasSchemas.LocalnetFundingV1,
      profile,
      identifier,
      status: "SDK_TOCCATA_FUNDING_UNSUPPORTED",
      message:
        "SDK Toccata funding is not supported in 0.9.6-alpha. Use `hardkas localnet fund <account> --profile toccata-v2`."
    };
  }

  /**
   * Resets the localnet state (simulated or node).
   */
  async reset(): Promise<void> {
    const { resetLocalnetState } = await import("@hardkas/localnet");
    await resetLocalnetState({ cwd: this.sdk.cwd });
  }

  private async detectToccataNode(): Promise<LocalnetStatusResult["node"]> {
    const rpcUrl = "ws://127.0.0.1:18210";
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const client = new JsonWrpcKaspaClient({ rpcUrl, timeoutMs: 3000 });
    try {
      const server = await client.getServerInfo();
      const info = await client.getInfo();
      const serverNetworkId = String((server as any).networkId || "");
      const result = {
        ready: true,
        rpcUrl,
        networkId:
          serverNetworkId === "unknown"
            ? "simnet"
            : (server as any).networkId || (info as any).networkId || "simnet",
        serverVersion: (server as any).serverVersion || (info as any).serverVersion,
        isSynced: (server as any).isSynced ?? (info as any).isSynced,
        virtualDaaScore: (info as any).virtualDaaScore?.toString()
      };
      await client.close();
      return result;
    } catch (error: any) {
      await client.close().catch(() => {});
      return {
        ready: false,
        rpcUrl,
        lastError: error?.message || String(error)
      };
    }
  }

  private inspectDockerContainer(name: string): LocalnetStatusResult["miner"] {
    const image = "hardkas/stratum-bridge:v2.0.0-local-simnet-unsynced";
    try {
      const stdout = execFileSync(
        "docker",
        ["inspect", "--format", "{{.State.Status}}|{{.Config.Image}}|{{.Name}}", name],
        {
          encoding: "utf8",
          stdio: "pipe"
        }
      );
      const [status, detectedImage, rawName] = stdout.trim().split("|");
      return {
        exists: true,
        running: status === "running",
        status: status || "unknown",
        image: detectedImage || image,
        name: rawName?.replace(/^\//, "") || name
      };
    } catch {
      return {
        exists: false,
        running: false,
        status: "not-found",
        image,
        name
      };
    }
  }
}
