import { getL2Profile, EvmJsonRpcClient, formatWeiAsEtherLike } from "@hardkas/l2";

export interface L2AccountOptions {
  network?: string;
  url?: string;
  block?: "latest" | "pending";
  json?: boolean;
}

async function getClient(options: L2AccountOptions) {
  const networkName = options.network ?? "igra";
  const profile = getL2Profile(networkName);

  if (!profile) {
    throw new Error(`L2 profile '${networkName}' not found.`);
  }

  const rpcUrl = options.url ?? profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${networkName}'. Pass --url <rpcUrl>.`);
  }

  return {
    client: new EvmJsonRpcClient({ url: rpcUrl }),
    profile,
    networkName
  };
}

export async function runL2Balance(address: string, options: L2AccountOptions): Promise<void> {
  const { client, profile, networkName } = await getClient(options);
  const blockTag = options.block ?? "latest";
  
  const balanceWei = await client.getBalanceWei(address, blockTag);
  const balanceFormatted = formatWeiAsEtherLike(balanceWei, profile.gasToken, profile.nativeTokenDecimals);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: networkName,
      chainId: profile.chainId,
      rpcUrl: profile.rpcUrl,
      address,
      block: blockTag,
      balanceWei: balanceWei.toString(),
      balanceFormatted,
      gasToken: profile.gasToken
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 balance`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`Address:  ${address}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Balance:  ${balanceFormatted}`);
  console.log(`Wei:      ${balanceWei}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM account state, not Kaspa L1 UTXO state.");
}

export async function runL2Nonce(address: string, options: L2AccountOptions): Promise<void> {
  const { client, profile, networkName } = await getClient(options);
  const blockTag = options.block ?? "latest";
  
  const nonce = await client.getTransactionCount(address, blockTag);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: networkName,
      chainId: profile.chainId,
      rpcUrl: profile.rpcUrl,
      address,
      block: blockTag,
      nonce: nonce.toString()
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 nonce`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`Address:  ${address}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Nonce:    ${nonce}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM account state, not Kaspa L1 UTXO state.");
}
