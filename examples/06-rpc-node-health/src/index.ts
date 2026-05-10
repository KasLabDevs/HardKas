import { 
  Hardkas, 
  formatSompi
} from "@hardkas/sdk";

/**
 * Example 06: RPC Node Health
 * 
 * Demonstrates real Kaspa RPC/node observability and diagnostics 
 * using the HardKAS toolchain.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    RPC Node Health Demo      ║");
  console.log("╚══════════════════════════════╝\n");

  // 1. Initialize Hardkas SDK
  // The SDK automatically resolves the RPC URL from config or environment.
  // By default, it target the local node at ws://127.0.0.1:18210
  const hardkas = await Hardkas.create();
  const rpcUrl = (hardkas.rpc as any).rpcUrl || "unknown";

  console.log(`# Connecting to Node`);
  console.log(`Target: ${rpcUrl}\n`);

  // 2. Connectivity & Basic Info
  console.log(`# Connectivity Check`);
  try {
    const start = Date.now();
    const info = await hardkas.rpc.getInfo();
    const latency = Date.now() - start;

    console.log(`✓ Connection established`);
    console.log(`  Latency:      ${latency}ms`);
    console.log(`  Version:      ${info.serverVersion}`);
    console.log(`  Network:      ${info.networkId}`);
    console.log(`  Synced:       ${info.isSynced ? "YES" : "NO"}`);
    console.log(`  DAA Score:    ${info.virtualDaaScore ?? "N/A"}`);
    console.log(`  Mempool:      ${info.mempoolSize} transactions\n`);
  } catch (error) {
    console.error(`✗ Failed to connect to node at ${rpcUrl}`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.log("Troubleshooting:");
    console.log("1. Ensure Docker is running.");
    console.log("2. Start the node with: pnpm hardkas node start");
    console.log("3. Verify the port 18210 is accessible.");
    process.exit(1);
  }

  // 3. BlockDAG Health
  console.log(`# BlockDAG Status`);
  try {
    const dag = await hardkas.rpc.getBlockDagInfo();
    console.log(`  Blocks:       ${dag.blockCount}`);
    console.log(`  Headers:      ${dag.headerCount}`);
    console.log(`  Difficulty:   ${dag.difficulty.toFixed(2)}`);
    console.log(`  Pruning Pt:   ${dag.pruningPointHash.slice(0, 16)}...`);
    console.log(`  Sink Tip:     ${dag.sink.slice(0, 16)}...`);
    
    if (dag.blockCount === 0n || dag.blockCount === 0) {
      console.log(`  [NOTE] This is a fresh genesis state (0 blocks).`);
    }
  } catch (error) {
    console.error(`✗ Failed to fetch BlockDAG info: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 4. UTXO/Account Observability (simulated address)
  console.log(`\n# Account Observability`);
  try {
    const alice = await hardkas.accounts.resolve("alice");
    console.log(`Account: Alice (${alice.address})`);
    
    const balance = await hardkas.accounts.getBalance("alice");
    console.log(`  Balance: ${balance.formatted}`);
    
    const utxos = await hardkas.rpc.getUtxosByAddress(alice.address!);
    console.log(`  UTXO Count: ${utxos.length}`);
    
    if (utxos.length > 0) {
      console.log(`\n  Recent UTXOs:`);
      utxos.slice(0, 3).forEach((u, i) => {
        console.log(`    [${i}] ${u.outpoint.transactionId.slice(0, 8)}...:${u.outpoint.index} (${formatSompi(u.amountSompi)})`);
      });
    }
  } catch (error) {
    console.error(`✗ Error inspecting account: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("\n# Diagnostics Completed");
  console.log("Node is healthy and responding to HardKAS queries.");
}

main().catch(err => {
  console.error("\n✖ Example failed");
  console.error(err);
  process.exit(1);
});
