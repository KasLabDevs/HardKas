import pkg from "kaspa-wasm";
const { RpcClient, Transaction, PrivateKey, Address, createTransaction, signTransaction } = pkg;

async function main() {
  const rpc = new RpcClient({
    url: "ws://127.0.0.1:18210",
    networkId: "simnet"
  });

  // Override the internal WebSocket send to spy on the payload!
  const originalConnect = rpc.connect.bind(rpc);
  await originalConnect();
  
  const originalSend = rpc.ws.send.bind(rpc.ws);
  rpc.ws.send = (data) => {
    console.log("kaspa-wasm sending:", data);
    return originalSend(data);
  };

  const privKey = new PrivateKey("b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef");
  const address = privKey.toKeypair().toAddress("simnet");
  
  const utxos = [
    {
      address: address.toString(),
      outpoint: {
        transactionId: "003a22372c7bfead2ad021b25d0623b5e504376989308a3a6e4cb0f0cf442a7b",
        index: 0
      },
      utxoEntry: {
        amount: 1000000000n,
        scriptPublicKey: "20ddb3088e5816041ef04e6e0f6935a911fe3f35b8e43fb60cdb44df40d3ef8b22ac",
        blockDaaScore: 0n,
        isCoinbase: false
      }
    }
  ];

  const outputs = [
    {
      address: address.toString(),
      amount: 1000000000n
    }
  ];

  const unsignedTx = createTransaction(utxos, outputs, address, 0n);
  const signedTx = signTransaction(unsignedTx, [privKey], true);

  try {
    const response = await rpc.submitTransaction({
      transaction: signedTx,
      allowOrphan: false
    });
    console.log("Success:", response);
  } catch (e) {
    console.error("Error submitting:", e);
  }

  await rpc.disconnect();
}

main().catch(console.error);
