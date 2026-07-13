import { RpcClient } from "@kaspa/core-rpc-node-ws";

async function run() {
  const client = new RpcClient({ resolver: null, encoding: "wrpc", networkId: "simnet" });
  await client.connect("ws://127.0.0.1:18210");
  console.log("Connected WASM client");
  try {
    const res = await client.getUtxosByAddresses({ addresses: ["kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j"] });
    console.log("Result:", res);
  } catch(e) {
    console.error("Error from WASM client:", e);
  }
  await client.disconnect();
}
run();
