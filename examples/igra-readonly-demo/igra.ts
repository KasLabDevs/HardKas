/**
 * HardKAS Example: Igra L2 Read-Only Demo
 *
 * Demonstrates querying the experimental Igra L2 local node.
 *
 * WARNING: Igra integration is read-only and experimental.
 * There is no trustless exit claim.
 */
import { EvmJsonRpcClient } from "@hardkas/l2";

async function main() {
  console.log("Initializing Igra L2 RPC Client...");

  // Connect to local Igra/EVM instance
  const client = new EvmJsonRpcClient({ url: "http://127.0.0.1:8545", timeoutMs: 5000 });

  try {
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Connected to Igra L2`);
    console.log(`Current Block: ${blockNumber}`);

    const chainId = await client.getChainId();
    console.log(`Chain ID: ${chainId}`);

    const gasPrice = await client.getGasPriceWei();
    console.log(`Gas Price: ${gasPrice.toString()} wei`);
  } catch (e: any) {
    console.error("Failed to connect to Igra L2 node. Is it running?");
    console.error(`Error: ${e.message}`);
  }
}

main().catch(console.error);
