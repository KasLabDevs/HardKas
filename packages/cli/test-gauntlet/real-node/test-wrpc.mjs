import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:18210');
ws.on('open', () => {
  console.log("Connected");
  const payload = {
    "jsonrpc":"2.0",
    "id":1,
    "method":"submitTransaction",
    "params":{
      "transaction":{
        "version":0,
        "inputs":[
          {
            "previousOutpoint":{"transactionId":"00015e06089cff0180e6f4a8147fe9ef5b7951c8ad6b3300cc852fbb1c0c6f6f","index":0},
            "signatureScript":"418feba4c9dbce550000e590c9d758387c8446f6bcb8e1da956657604f95e262edd6ab4cbd97410298fc041e1c87a4896897e28aece99797f33a4d9aafc90e754201",
            "sequence":0,
            "sigOpCount":1
          }
        ],
        "outputs":[
          {
            "amount":100000000000,
            "scriptPublicKey":{"version":0,"script":"2051c99544546f42521b0f4b570f1589875a7c5481e221c41d7851a7341b127e2eac"}
          }
        ],
        "lockTime":0,
        "subnetworkId":"0000000000000000000000000000000000000000",
        "gas":0,
        "mass":0,
        "payload":""
      },
      "allowOrphan":false
    }
  };
  ws.send(JSON.stringify(payload));
});

ws.on('message', (msg) => {
  console.log(msg.toString());
  ws.close();
});
