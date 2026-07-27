import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/dist/index.js";

async function main() {
  const rpcUrl = "ws://127.0.0.1:18210";
  console.log("Connecting to", rpcUrl);
  const client = new JsonWrpcKaspaClient({ rpcUrl });
  try {
    const serverInfo = await client.getServerInfo();
    console.log("Server info:", serverInfo);
    const sync = await client.getSyncStatus();
    console.log("Sync status:", sync);
  } catch (e) {
    console.error("Error connecting:", e);
  } finally {
    await client.close();
  }
}
main();
