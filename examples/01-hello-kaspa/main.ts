import { Hardkas } from "@hardkas/sdk";

async function main() {
  const start = Date.now();

  console.log("\x1b[35m╔══════════════════════════════╗\x1b[0m");
  console.log("\x1b[35m║         \x1b[1mHardKAS\x1b[0m\x1b[35m              ║\x1b[0m");
  console.log("\x1b[35m║     \x1b[3mHello Kaspa Example\x1b[0m\x1b[35m      ║\x1b[0m");
  console.log("\x1b[35m╚══════════════════════════════╝\x1b[0m");
  console.log("");

  try {
    // Standard initialization: loads hardkas.config.ts automatically
    const hardkas = await Hardkas.create();
    
    // Low-ceremony RPC access with latency check
    const rpcStart = Date.now();
    const info = await hardkas.rpc.getInfo();
    const latency = Date.now() - rpcStart;

    console.log(`\x1b[1mNetwork:\x1b[0m       ${hardkas.network}`);
    console.log(`\x1b[1mRPC:\x1b[0m           \x1b[32mconnected\x1b[0m (${(hardkas.rpc as any).rpcUrl})`);
    console.log(`\x1b[1mDAA Score:\x1b[0m     ${info.virtualDaaScore}`);
    
    // Kaspa-native metrics
    if (info.raw) {
       const raw = info.raw as any;
       if (raw.blueScore) console.log(`\x1b[1mBlue Score:\x1b[0m    ${raw.blueScore}`);
       if (raw.selectedParentHash) {
         const hash = raw.selectedParentHash as string;
         console.log(`\x1b[1mSelected Tip:\x1b[0m  ${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`);
       }
    }
    
    console.log(`\x1b[1mLatency:\x1b[0m       ${latency}ms`);
    console.log("");
    console.log("\x1b[32m✓\x1b[0m HardKAS environment ready");

    // Cleanly close resources
    await hardkas.rpc.close();
  } catch (error) {
    console.log("");
    console.error("\x1b[31m✖\x1b[0m \x1b[1mFailed to connect to Kaspa network.\x1b[0m");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
