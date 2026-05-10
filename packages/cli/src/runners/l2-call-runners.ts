import { getL2Profile, EvmJsonRpcClient, EvmCallRequest } from "@hardkas/l2";

export interface L2CallRunnerOptions {
  network?: string;
  url?: string;
  from?: string;
  to: string;
  data?: string;
  value?: string;
  block?: "latest" | "pending";
  json?: boolean;
}

async function getClient(options: { network?: string; url?: string }) {
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
    networkName,
    rpcUrl
  };
}

export async function runL2Call(options: L2CallRunnerOptions): Promise<void> {
  const { client, profile, networkName, rpcUrl } = await getClient(options);
  
  const request: EvmCallRequest = {
    ...(options.from ? { from: options.from } : {}),
    to: options.to,
    ...(options.data ? { data: options.data } : {}),
    ...(options.value ? { value: options.value } : {})
  };

  const blockTag = options.block ?? "latest";
  const result = await client.call(request, blockTag);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: networkName,
      chainId: profile.chainId,
      rpcUrl,
      block: blockTag,
      request,
      result
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 eth_call`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`URL:      ${rpcUrl}`);
  console.log(`To:       ${options.to}`);
  if (options.from) console.log(`From:     ${options.from}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Data:     ${options.data ?? "0x"}`);
  console.log("");
  console.log("Result:");
  console.log(`  ${result}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is an L2 EVM read/preflight call, not a Kaspa L1 transaction.");
}

export async function runL2EstimateGas(options: L2CallRunnerOptions): Promise<void> {
  const { client, profile, networkName, rpcUrl } = await getClient(options);
  
  const request: EvmCallRequest = {
    ...(options.from ? { from: options.from } : {}),
    to: options.to,
    ...(options.data ? { data: options.data } : {}),
    ...(options.value ? { value: options.value } : {})
  };

  const blockTag = options.block ?? "latest";
  const gas = await client.estimateGas(request, blockTag);

  if (options.json) {
    console.log(JSON.stringify({
      networkId: profile.name,
      l2Network: networkName,
      chainId: profile.chainId,
      rpcUrl,
      block: blockTag,
      request,
      gas: gas.toString()
    }, null, 2));
    return;
  }

  console.log(`${profile.displayName} L2 gas estimate`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`URL:      ${rpcUrl}`);
  console.log(`To:       ${options.to}`);
  if (options.from) console.log(`From:     ${options.from}`);
  console.log(`Block:    ${blockTag}`);
  console.log(`Data:     ${options.data ?? "0x"}`);
  console.log("");
  console.log(`Gas:      ${gas}`);
  console.log("");
  console.log("Warning:");
  console.log("  This is an L2 EVM gas estimate, not a Kaspa L1 mass estimate.");
}
