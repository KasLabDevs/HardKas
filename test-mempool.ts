import { JsonWrpcKaspaClient } from "./packages/kaspa-rpc/src/index.js";
async function run() {
    // we need to connect to the actual testnet or simnet node, but we don't know the address.
    // wait, what is the structure of a transaction in Kaspa RPC?
    // It's RpcTransaction: { version, inputs: [{ previousOutpoint: { transactionId, index }, signatureScript, sequence, sigOpCount }], outputs: [...], lockTime, subnetworkId, gas, payload, mass }
    // Let's just create the client to simnet if it's running on 16210, but it's not.
}
run();
