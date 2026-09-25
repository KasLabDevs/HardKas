"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("@hardkas/sdk");
async function main() {
    console.log("1. Opening HardKAS connected to localnet...");
    const sdk = await sdk_1.Hardkas.open({ cwd: process.cwd(), network: "simnet" });
    console.log("2. Waiting for node sync...");
    await sdk.node.waitForSync({ timeout: 5000 });
    console.log("3. Resolving dev accounts (Alice and Bob)...");
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");
    console.log("4. Requesting funds from Localnet faucet for Alice...");
    await sdk.localnet.faucet.fund(alice.address, 1000n * 100000000n);
    // Wait a moment for mining
    await new Promise(r => setTimeout(r, 2000));
    console.log(`5. Alice balance: ${await sdk.utxos.getBalance(alice.address)}`);
    console.log("6. Planning transaction...");
    const planResult = await sdk.tx.plan({
        from: alice,
        to: bob,
        amount: 10n * 100000000n, // 10 KAS
        networkId: "simnet"
    });
    console.log("Plan created with ID:", planResult.artifactId);
    await sdk.artifacts.write(planResult);
    console.log("7. Signing transaction...");
    const signed = await sdk.tx.sign(planResult);
    await sdk.artifacts.write(signed);
    console.log("8. Submitting to real localnet node...");
    const receipt = await sdk.tx.send(signed);
    await sdk.artifacts.write(receipt);
    console.log("Transaction successfully submitted!");
    console.log(`TxID: ${receipt.txId}`);
    console.log("9. Verifying evidence...");
    const verifyResult = await sdk.artifacts.verify(receipt);
    console.log("Evidence verification OK:", verifyResult.ok);
    // Wait a moment
    await new Promise(r => setTimeout(r, 1000));
}
main().catch(console.error);
