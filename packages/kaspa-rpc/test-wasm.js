async function main() {
  const kaspa = await import("kaspa-wasm");

  const rpc = new kaspa.RpcClient({
    url: "ws://127.0.0.1:18210",
    networkId: "simnet"
  });

  await rpc.connect();
  console.log("Connected to wRPC via kaspa-wasm");

  const txObj = {
    version: 0,
    inputs: [
      {
        previousOutpoint: {
          transactionId: "003a22372c7bfead2ad021b25d0623b5e504376989308a3a6e4cb0f0cf442a7b",
          index: 0
        },
        signatureScript: "41d9aaac6b511fea032c5b073dd9342e84a6171f052b7006092d845777563a9ed914fc1d8a6545a7a77451972780490ad14934f3f46403f810192da0b0a69ec84d01",
        sequence: 0,
        sigOpCount: 1
      }
    ],
    outputs: [
      {
        amount: 1000000000n,
        scriptPublicKey: {
          version: 0,
          scriptPublicKey: "20ddb3088e5816041ef04e6e0f6935a911fe3f35b8e43fb60cdb44df40d3ef8b22ac"
        }
      }
    ],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  };

  const tx = new kaspa.Transaction(txObj);
  console.log("Transaction created:", JSON.stringify(tx));

  try {
    const response = await rpc.submitTransaction({
      transaction: tx,
      allowOrphan: false
    });
    console.log("Success:", response);
  } catch (e) {
    console.error("Error submitting:", e);
  }

  await rpc.disconnect();
}

main().catch(console.error);
