import WebSocket from "ws";

async function run() {
  const ws = new WebSocket("ws://127.0.0.1:18210");
  const txId = process.argv[2];
  
  ws.on('open', () => {
    ws.send(JSON.stringify({
      "jsonrpc": "2.0", "id": 1, "method": "getBlockDagInfo", "params": {}
    }));
  });

  let currentHash = "";
  let blocksChecked = 0;

  ws.on('message', (data) => {
    const res = JSON.parse(data.toString());
    if (res.id === 1) {
      currentHash = res.params.tipHashes[0];
      ws.send(JSON.stringify({
        "jsonrpc": "2.0", "id": 2, "method": "getBlock", 
        "params": { "hash": currentHash, "includeTransactions": true }
      }));
    } else if (res.id === 2) {
      if (res.error) {
        console.error(res.error);
        process.exit(1);
      }
      const block = res.params.block;
      for (const tx of block.transactions) {
        if (tx.verboseData.transactionId === txId) {
          console.log(`FOUND TX ${txId} IN BLOCK ${currentHash}`);
          process.exit(0);
        }
      }
      blocksChecked++;
      if (blocksChecked >= 10000) {
        console.log(`Checked 10000 blocks, tx ${txId} NOT FOUND.`);
        process.exit(0);
      }
      const parentHash = block.header?.parentsByLevel?.[0]?.[0];
      if (!parentHash) {
        console.log("No parent hash found!", block.header);
        process.exit(1);
      }
      currentHash = parentHash;
      ws.send(JSON.stringify({
        "jsonrpc": "2.0", "id": 2, "method": "getBlock", 
        "params": { "hash": currentHash, "includeTransactions": true }
      }));
    }
  });

  ws.on('error', console.error);
}
run();
