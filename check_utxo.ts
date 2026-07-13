import WebSocket from "ws";

async function run() {
  const ws = new WebSocket("ws://127.0.0.1:18210");
  
  const address = process.argv[2] || "kaspasim:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc656wlktmzx";
  ws.on('open', () => {
    ws.send(JSON.stringify({
      "jsonrpc": "2.0", "id": 1, "method": "getUtxosByAddresses", 
      "params": {"addresses":[address]}
    }));
  });

  ws.on('message', (data) => {
    const res = JSON.parse(data.toString());
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  });

  ws.on('error', console.error);
}
run();
