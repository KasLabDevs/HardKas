import { loadHardkasConfig } from "@hardkas/config";
import { resolveHardkasAccountAddress } from "@hardkas/accounts";
import { 
  loadOrCreateLocalnetState, 
  saveLocalnetState, 
  fundAddress 
} from "@hardkas/localnet";

export interface AccountsFundOptions {
  identifier: string;
  amountSompi?: bigint;
}

export async function runAccountsFund(options: AccountsFundOptions) {
  const loadedConfig = await loadHardkasConfig({});
  const address = resolveHardkasAccountAddress(options.identifier, loadedConfig.config);
  
  // 1. Safety Check: Determine current network
  const networkId = loadedConfig.config.defaultNetwork || "simnet";
  const networkConfig = loadedConfig.config.networks?.[networkId];
  
  const isSimulated = networkId === "simulated" || networkId === "localnet" || networkConfig?.kind === "simulated";
  
  const allowedNetworks = ["simnet", "localnet", "dev", "simulated"];
  
  if (!allowedNetworks.includes(networkId) && !isSimulated) {
    throw new Error(`Faucet/Funding is only allowed on development networks (${allowedNetworks.join(", ")}). Current network is: ${networkId}`);
  }

  // 2. Handle Simulated Environment
  if (isSimulated) {
    const state = await loadOrCreateLocalnetState();
    const amount = options.amountSompi || 1000n * 100_000_000n; // Default 1000 KAS
    const newState = fundAddress(state, { address, amountSompi: amount });
    await saveLocalnetState(newState);
    
    return {
      success: true,
      address,
      amountSompi: amount,
      mode: "simulated",
      formatted: `Successfully funded ${options.identifier} (${address}) with ${Number(amount) / 100_000_000} KAS (Simulated)`
    };
  }

  // 3. Handle Docker/Real simnet
  if (networkId === "simnet" || networkId === "dev") {
    // For now, we inform the user. In future versions, we can automate mining.
    throw new Error(
      `Funding for real simnet (Docker) via faucet requires a miner account. \n` +
      `Hint: Start your node with 'hardkas node start --miningaddr ${address}' to mine coins directly to this account.`
    );
  }

  throw new Error(`Unsupported network for funding: ${networkId}`);
}
