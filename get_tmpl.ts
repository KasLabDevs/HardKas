import { Hardkas } from "./packages/sdk/src/index.js";

async function run() {
  const sdk = await Hardkas.open({ network: "simnet" });
  console.log("Connected");
  try {
    const mempool = await (sdk.rpc as any).call("getMempoolEntries", {});
    console.log("Mempool size:", mempool.mempoolEntries?.length);
    console.log("Mempool txs:", mempool.mempoolEntries?.map((t: any) => t.transaction.verboseData.transactionId));

    const tmpl = await (sdk.rpc as any).call("getBlockTemplate", {
      payAddress: "kaspasim:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc656wlktmzx",
      extraData: "test"
    });
    console.log("Txs in template:", tmpl.block.transactions.length);
    console.log("Tx details:", tmpl.block.transactions.map((t: any) => t.verboseData.transactionId));
  } catch(e: any) {
    console.log("Err:", e);
  }
  process.exit(0);
}
run();
