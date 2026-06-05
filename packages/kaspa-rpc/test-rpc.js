import WebSocket from "ws";

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
      amount: 1000000000,
      scriptPublicKey: {
        version: 0,
        scriptPublicKey: "20ddb3088e5816041ef04e6e0f6935a911fe3f35b8e43fb60cdb44df40d3ef8b22ac"
      }
    }
  ],
  lockTime: 0,
  subnetworkId: "0000000000000000000000000000000000000000",
  gas: 0,
  payload: ""
};

const ws = new WebSocket("ws://127.0.0.1:18210");

ws.on("open", () => {
  const payloads = [];

  // 1. Array params
  payloads.push({ params: [txObj, false], name: "Positional Array" });

  // 2. Array params with object
  payloads.push({ params: [{ transaction: txObj, allowOrphan: false }], name: "Single Object Array" });

  let idx = 0;
  ws.on("message", (data) => {
    console.log(`Response to ${idx + 1}:`, data.toString());
    idx++;
    if (idx < payloads.length) {
      sendNext(idx + 1, payloads[idx].params, payloads[idx].name);
    } else {
      process.exit(0);
    }
  });

  const sendNext = (id, params, name) => {
    console.log(`Sending ${name} (id: ${id})`);
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "submitTransaction",
      params
    }));
  };

  sendNext(idx + 1, payloads[idx].params, payloads[idx].name);
});
