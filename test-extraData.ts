import { spawn } from "child_process";
import WebSocket from "ws";
import net from "net";

function rpcCall(ws: WebSocket, id: number, method: string, params: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const timeout = setTimeout(() => reject(new Error(`Timeout`)), 5000);
    const handler = (data: any) => {
      clearTimeout(timeout);
      ws.removeListener("message", handler);
      resolve(JSON.parse(data.toString()));
    };
    ws.on("message", handler);
    ws.send(payload);
  });
}

(async () => {
  const port = 63491;
  const child = spawn("docker", [
    "run", "--rm", "-p", `${port}:${port}`,
    "kaspanet/rusty-kaspad:v2.0.1", "kaspad",
    "--simnet",
    `--rpclisten-json=0.0.0.0:${port}`,
    "--enable-unsynced-mining",
    "--reset-db"
  ]);

  await new Promise(r => setTimeout(r, 2000));
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise(r => ws.on("open", r));

  const validAddress = "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqn648kfwc";
  const variations = [
    { name: "no extraData", params: { payAddress: validAddress } },
    { name: "string empty", params: { payAddress: validAddress, extraData: "" } },
    { name: "string hex", params: { payAddress: validAddress, extraData: "00" } },
    { name: "string 0x hex", params: { payAddress: validAddress, extraData: "0x00" } },
    { name: "empty array", params: { payAddress: validAddress, extraData: [] } },
    { name: "array of nums", params: { payAddress: validAddress, extraData: [0, 0] } },
    { name: "snake_case", params: { pay_address: validAddress, extra_data: "" } }
  ];

  for (let i = 0; i < variations.length; i++) {
    const v = variations[i];
    const res = await rpcCall(ws, i+1, "getBlockTemplate", v.params);
    if (res.error) {
      console.log(`❌ ${v.name}: ${res.error.message}`);
    } else {
      console.log(`✅ ${v.name}: OK`);
    }
  }

  ws.close();
  child.kill("SIGKILL");
})();
