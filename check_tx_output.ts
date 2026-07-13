import WebSocket from "ws";

async function run() {
  const ws = new WebSocket("ws://127.0.0.1:18210");
  
  ws.on('open', () => {
    ws.send(JSON.stringify({
      "jsonrpc": "2.0", "id": 1, "method": "getBlock", 
      "params": { "hash": "8a2b9853fb3931f56a22c053fc7f2ef1612d993ec665b5f4eb580c3024dbba7c", "includeTransactions": true }
    }));
  });

  ws.on('message', (data) => {
    const res = JSON.parse(data.toString());
    const block = res.params.block;
    for (const tx of block.transactions) {
      if (tx.verboseData.transactionId === "8a2d337d6ba7f275eafd5f177c754ad122ee82c0edcd920b4ddcb0a2b5fba1ee") {
        console.log(JSON.stringify(tx.outputs, null, 2));
      }
    }
    process.exit(0);
  });

  ws.on('error', console.error);
}
run();
