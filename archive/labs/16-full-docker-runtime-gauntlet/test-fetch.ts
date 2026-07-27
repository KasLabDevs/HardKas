import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";
import { DockerKaspadRunner } from "@hardkas/node-runner";

async function test() {
    const req = {
        "jsonrpc": "1.0",
        "id": "curltest",
        "method": "submitTransaction",
        "params": [
            {
                "transaction": {
                  "version": 0,
                  "inputs": [
                    {
                      "previousOutpoint": {
                        "transactionId": "7df19d60d9de7b66f161bede36a650047f664996a65582b76c2315bec23ac678",
                        "index": 0
                      },
                      "signatureScript": "41655ceaa1ec5bb53457ec77cd2f54a8677c77cf4794e5033c411d310e53a3eb271e89ceea5c00e1cf92aef4afb55f6fb083c65e8a00ddfc531cd3305de1d3cb01",
                      "sequence": "0",
                      "sigOpCount": 1
                    }
                  ],
                  "outputs": [
                    {
                      "scriptPublicKey": "000020b28fa60b2866c3780c758aab5eea1b304f0064232cbabec764f33058a8614f96ac",
                      "value": 10000
                    }
                  ],
                  "lockTime": 0,
                  "subnetworkId": "0000000000000000000000000000000000000000",
                  "gas": 0,
                  "payload": "",
                  "mass": 0
                },
                "allowOrphan": false
            }
        ]
    };
    
    try {
        const res = await fetch("http://127.0.0.1:18210", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req)
        });
        console.log("Status:", res.status);
        console.log("Response:", await res.text());
    } catch(e) {
        console.log("Fetch error:", e);
    }
}
test().catch(console.error);
test().catch(console.error);
