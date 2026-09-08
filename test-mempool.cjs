const { JsonWrpcKaspaClient } = require('@hardkas/kaspa-rpc');
async function run() {
    const rpc = new JsonWrpcKaspaClient('ws://127.0.0.1:16210');
    await rpc.connect();
    
    // get an address from the node
    const res = await rpc.call('getBalancesByAddresses', { addresses: [] });
    // wait I need an address.
    const all = await rpc.call('getMempoolEntries', { includeOrphanPool: false, filterTransactionPool: false });
    console.log(JSON.stringify(all, null, 2));
    rpc.disconnect();
}
run();
