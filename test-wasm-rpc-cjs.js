async function run() {
  const { RpcClient } = await import("./packages/kaspa-rpc/node_modules/@kaspa/core-rpc-node-ws/kaspa_core_rpc_node_ws.js").catch(async () => {
      return import("@kaspa/core-rpc-node-ws");
  });
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
