import { getL2Profile, EvmJsonRpcClient } from "@hardkas/l2";

export interface L2RpcQueryOptions {
  network?: string;
  url?: string;
  json?: boolean;
}

async function getClient(options: L2RpcQueryOptions) {
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

export async function runL2RpcChainId(options: L2RpcQueryOptions): Promise<void> {
  const { client, profile, networkName } = await getClient(options);
  const chainId = await client.getChainId();

  if (options.json) {
    console.log(JSON.stringify({ 
      networkId: profile.name,
      l2Network: networkName,
      rpcUrl: profile.rpcUrl,
      chainId 
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 chain`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`Chain ID: ${chainId}`);
  console.log("");
  console.log("Warning: This is L2 state.");
}

export async function runL2RpcBlockNumber(options: L2RpcQueryOptions): Promise<void> {
  const { client, profile, networkName } = await getClient(options);
  const blockNumber = await client.getBlockNumber();

  if (options.json) {
    console.log(JSON.stringify({ 
      networkId: profile.name,
      l2Network: networkName,
      rpcUrl: profile.rpcUrl,
      blockNumber: blockNumber.toString() 
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 block`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`Block:    ${blockNumber}`);
  console.log("");
  console.log("Warning: This is L2 state.");
}

export async function runL2RpcGasPrice(options: L2RpcQueryOptions): Promise<void> {
  const { client, profile, networkName } = await getClient(options);
  const gasPrice = await client.getGasPriceWei();

  if (options.json) {
    console.log(JSON.stringify({ 
      networkId: profile.name,
      l2Network: networkName,
      rpcUrl: profile.rpcUrl,
      gasPrice: gasPrice.toString() 
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 gas price`);
  console.log("");
  console.log(`Network:   ${networkName}`);
  console.log(`Gas price: ${gasPrice} wei`);
  console.log("");
  console.log("Warning: This is L2 state.");
}
