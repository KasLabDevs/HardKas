import { UI, handleError } from "../ui.js";
import { loadHardkasConfig, resolveNetworkTarget } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { forkFromNetwork, saveLocalnetState } from "@hardkas/localnet";
import { resolve } from "node:path";
import fs from "node:fs/promises";
import { withLock } from "@hardkas/core";

export async function runLocalnetFork(opts: {
  network: string;
  addresses: string[];
  atDaaScore?: string;
  outputPath?: string;
}): Promise<void> {
  UI.header(`HardKAS Localnet Fork`);
  
  const { config } = await loadHardkasConfig();
  const { target } = resolveNetworkTarget({ config, network: opts.network });

  if (target.kind === "simulated") {
    throw new Error("Cannot fork from a simulated network.");
  }

  const rpcUrl = (target as any).rpcUrl;
  if (!rpcUrl) throw new Error(`No RPC URL configured for network '${opts.network}'.`);

  UI.info(`Forking from: ${opts.network} (${rpcUrl})`);
  if (opts.addresses.length > 0) {
    UI.info(`Addresses: ${opts.addresses.join(", ")}`);
  } else {
    UI.warning("No addresses specified. Forked state will be empty.");
  }

  const client = new JsonWrpcKaspaClient({ rpcUrl });
  try {
    await withLock({
      rootDir: process.cwd(),
      name: "workspace",
      command: "hardkas localnet fork",
    }, async () => {
      const state = await forkFromNetwork(client, {
        network: opts.network,
        rpcUrl,
        addresses: opts.addresses,
        ...(opts.atDaaScore ? { atDaaScore: opts.atDaaScore } : {})
      });

      const outputPath = opts.outputPath 
        ? resolve(opts.outputPath)
        : resolve(process.cwd(), ".hardkas", "localnet-state.json");

      await saveLocalnetState(state);
      
      UI.success(`Forked state saved to: ${outputPath}`);
      UI.info(`DAA Score: ${state.daaScore}`);
      UI.info(`UTXOs: ${state.utxos.length}`);
    });
  } catch (e) {
    handleError(e, "Forking failed");
    process.exit(1);
  } finally {
    await client.close();
  }
}
