import WebSocket from "ws";

async function run() {
  const ws = new WebSocket("ws://127.0.0.1:18210");
  
  ws.on('open', () => {
    ws.send(JSON.stringify({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "getMempoolEntries",
      "params": {}
    }));
  });

  ws.on('message', (data) => {
    const res = JSON.parse(data.toString());
    if (res.id === 1) {
      console.log("Mempool size:", res.params?.entries?.length);
      console.log("Txs:", res.params?.entries?.map((e: any) => e.transaction.verboseData.transactionId));

      ws.send(JSON.stringify({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "getBlockTemplate",
        "params": {
          "payAddress": "kaspasim:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc656wlktmzx",
          "extraData": "112233"
        }
      }));
    } else if (res.id === 2) {
      console.log("Template txs:", res.params?.block?.transactions?.length);
      console.log("Template error:", res.error);
      process.exit(0);
    }
  });

  ws.on('error', console.error);
}
run();
