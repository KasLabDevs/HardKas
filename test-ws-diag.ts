import { SimnetNodeHarness } from "./packages/testing/src/simnet-node-harness.js";
import WebSocket from "ws";

async function run() {
    console.log("=== WS DIAGNOSTIC ===\n");
    
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    console.log(`Node at ${node.rpcUrl}`);
    console.log(`Simulated: ${(node as any).simulated}`);

    const ws = new WebSocket(node.rpcUrl);
    
    let msgCount = 0;
    ws.on("message", (data, isBinary) => {
        msgCount++;
        if (isBinary) {
            const buf = Buffer.from(data as any);
            console.log(`[MSG #${msgCount}] BINARY (${buf.length} bytes): ${buf.toString("hex").substring(0, 100)}`);
        } else {
            const txt = data.toString();
            console.log(`[MSG #${msgCount}] TEXT (${txt.length} chars): ${txt.substring(0, 300)}`);
        }
    });

    ws.on("open", () => {
        console.log("WebSocket OPEN");
        console.log(`Protocol: ${ws.protocol}`);
        console.log(`Extensions: ${ws.extensions}`);
        
        // Wait 2s to see if server sends anything first
        setTimeout(() => {
            console.log(`\nAfter 2s: received ${msgCount} spontaneous messages`);
            
            // Now send a simple request
            const payload = JSON.stringify({ id: 1, method: "getServerInfoRequest", params: {} });
            console.log(`\nSending: ${payload}`);
            ws.send(payload);
            
            // Also try sending as binary
            setTimeout(() => {
                console.log(`\nAfter another 2s: total msgs=${msgCount}`);
                
                // Try sending the same thing as a Buffer (binary frame)
                const binPayload = Buffer.from(payload);
                console.log(`Sending same payload as binary frame (${binPayload.length} bytes)`);
                ws.send(binPayload);
                
                setTimeout(() => {
                    console.log(`\nFinal after 2s more: total msgs=${msgCount}`);
                    ws.close();
                    node.kill();
                }, 2000);
            }, 2000);
        }, 2000);
    });

    ws.on("error", (err) => console.log(`WS ERROR: ${err.message}`));
    ws.on("close", (code, reason) => console.log(`WS CLOSE: code=${code} reason=${reason.toString()}`));
    ws.on("ping", (data) => console.log(`WS PING: ${data.toString()}`));
    ws.on("pong", (data) => console.log(`WS PONG: ${data.toString()}`));
    ws.on("unexpected-response", (req, res) => console.log(`WS UNEXPECTED: ${res.statusCode}`));
}

run().catch(console.error);
