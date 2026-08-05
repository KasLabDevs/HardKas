import { Client } from "./packages/sdk/dist/client.js";
async function main() {
  const client = new Client({ url: "ws://localhost:16210" });
  await client.connect();
  let daa = 0;
  while (daa < 1450) {
    const info = await client.rpc.getVirtualSelectedParentBlueScore();
    daa = parseInt(info.blueScore, 10);
    console.log(`Current DAA: ${daa}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log("Ready!");
  process.exit(0);
}
main();
