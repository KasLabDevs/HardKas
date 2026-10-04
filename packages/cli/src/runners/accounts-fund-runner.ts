import { loadHardkasConfig } from "@hardkas/config";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import { parseKasToSompi } from "@hardkas/core";
import {
  loadOrCreateLocalnetState,
  saveLocalnetState,
  fundAddress,
  withSimulatorState
} from "@hardkas/localnet";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

export interface AccountsFundOptions {
  identifier: string;
  amountSompi?: bigint;
}

/** `--amount` of the synthetic fund commands: KAS with up to 8 decimals, above 0. */
export function parseFundAmount(amount: string): bigint {
  const sompi = parseKasToSompi(amount);
  if (sompi <= 0n) {
    throw new HardkasCliError("INVALID_KAS_AMOUNT", "--amount must be greater than 0", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  return sompi;
}

export async function runAccountsFund(options: AccountsFundOptions) {
  const loadedConfig = await loadHardkasConfig({});
  const address = await resolveHardkasAccountAddress(
    options.identifier,
    loadedConfig.config
  );

  // 1. Safety Check: Determine current network
  const networkId = loadedConfig.config.defaultNetwork || "simnet";
  const networkConfig = loadedConfig.config.networks?.[networkId];

  const isSimulated =
    networkId === "simulated" ||
    networkId === "localnet" ||
    networkConfig?.kind === "simulated";

  const allowedNetworks = ["simnet", "localnet", "dev", "simulated"];

  if (!allowedNetworks.includes(networkId) && !isSimulated) {
    throw new Error(
      `Faucet/Funding is only allowed on development networks (${allowedNetworks.join(", ")}). Current network is: ${networkId}`
    );
  }

  // 2. Handle Simulated Environment
  if (isSimulated) {
    const { formatSompiToKas } = await import("@hardkas/core");
    const amount = options.amountSompi ?? 1000n * 100_000_000n; // Default 1000 KAS
    // SIMULATOR-EXECUTION-UNIT-1: read → fund → write of the simulated state as one unit
    await withSimulatorState(process.cwd(), async () => {
      const state = await loadOrCreateLocalnetState();
      const newState = fundAddress(state, { address, amountSompi: amount });
      await saveLocalnetState(newState);
    });

    return {
      success: true,
      address,
      amountSompi: amount,
      mode: "simulator",
      formatted: `Successfully funded ${options.identifier} (${address}) with ${formatSompiToKas(amount)} KAS (Simulated)`
    };
  }

  // 3. Handle Docker/Real simnet
  if (networkId === "simnet" || networkId === "dev") {
    // Real simnet funds come from mining, which `hardkas localnet fund` drives.
    throw new Error(
      `Funding for real simnet (Docker) via faucet requires a miner account. \n` +
        `Hint: run 'hardkas localnet fund ${options.identifier}' to mine coins to this account on the toccata-v2 node.`
    );
  }

  throw new Error(`Unsupported network for funding: ${networkId}`);
}
