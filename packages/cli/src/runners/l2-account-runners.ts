import { resolveL2Profile, EvmJsonRpcClient, formatWeiAsEtherLike, L2NetworkProfile } from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";

export interface L2AccountOptions {
  network?: string;
  url?: string;
  chainId?: string | number;
  block?: "latest" | "pending";
  json?: boolean;
}

async function getClient(options: L2AccountOptions) {
  const loaded = await loadHardkasConfig();
  const profile = resolveL2Profile({
    name: options.network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {}),
      ...(options.chainId !== undefined ? { chainId: options.chainId } : {})
    }
  });

  const rpcUrl = profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`);
  }

  return {
    client: new EvmJsonRpcClient({ url: rpcUrl }),
    profile
  };
}

export async function runL2Balance(address: string, options: L2AccountOptions): Promise<void> {
  const { client, profile } = await getClient(options);
  const blockTag = options.block ?? "latest";
  
  const balanceWei = await client.getBalanceWei(address, blockTag);
  const balanceFormatted = formatWeiAsEtherLike(balanceWei, profile.gasToken, profile.nativeTokenDecimals);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: profile.name,
      chainId: profile.chainId,
      rpcUrl: profile.rpcUrl,
      source: profile.source,
      address,
      block: blockTag,
      balanceWei: balanceWei.toString(),
      balanceFormatted,
      gasToken: profile.gasToken
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 balance (${profile.source})`);
  console.log("");
  console.log(`Network:  ${profile.name}`);
  console.log(`Address:  ${address}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Balance:  ${balanceFormatted}`);
  console.log(`Wei:      ${balanceWei}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM account state, not Kaspa L1 UTXO state.");
}

export async function runL2Nonce(address: string, options: L2AccountOptions): Promise<void> {
  const { client, profile } = await getClient(options);
  const blockTag = options.block ?? "latest";
  
  const nonce = await client.getTransactionCount(address, blockTag);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: profile.name,
      chainId: profile.chainId,
      rpcUrl: profile.rpcUrl,
      source: profile.source,
      address,
      block: blockTag,
      nonce: nonce.toString()
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 nonce (${profile.source})`);
  console.log("");
  console.log(`Network:  ${profile.name}`);
  console.log(`Address:  ${address}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Nonce:    ${nonce}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM account state, not Kaspa L1 UTXO state.");
}
