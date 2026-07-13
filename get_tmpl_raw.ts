async function run() {
  const payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getMempoolEntries",
    "params": {}
  };
  try {
    const res = await fetch("http://127.0.0.1:18210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.log("Mempool size:", json.params?.mempoolEntries?.length);
    console.log("Txs:", json.params?.mempoolEntries?.map((e: any) => e.transaction.verboseData.transactionId));

    const tmplPayload = {
      "jsonrpc": "2.0",
      "id": 2,
      "method": "getBlockTemplate",
      "params": {
        "payAddress": "kaspasim:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc656wlktmzx",
        "extraData": "test"
      }
    };
    const tmplRes = await fetch("http://127.0.0.1:18210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tmplPayload)
    });
    const tmplJson = await tmplRes.json();
    console.log("Template txs:", tmplJson.params?.block?.transactions?.length);
    console.log("Template error:", tmplJson.error);
  } catch(e) {
    console.error(e);
  }
}
run();
