import { DockerKaspadRunner } from "@hardkas/node-runner";

async function main() {
    const runner = new DockerKaspadRunner({ network: "simnet" });
    await runner.start();

    try {
        await new Promise(r => setTimeout(r, 5000));
        
        await new Promise<void>((resolve, reject) => {
            const ws = new globalThis.WebSocket("ws://127.0.0.1:18210");
            
            ws.addEventListener("open", () => {
                console.log("Connected");
                
                // Try format 1: JSON-RPC
                ws.send(JSON.stringify({ method: "getVirtualSelectedParentBlueScoreRequest", params: {} }));
                
                // Try format 2: Kaspa WRPC Message envelope
                // In Rusty Kaspa, wrpc JSON encoding uses a single enum variant for the request:
                // { "GetVirtualSelectedParentBlueScoreRequest": {} }
                ws.send(JSON.stringify({ GetVirtualSelectedParentBlueScoreRequest: { requestId: 1 } }));
                
                // Try format 3: lowercase enum
                ws.send(JSON.stringify({ getVirtualSelectedParentBlueScoreRequest: { requestId: 2 } }));
            });

            ws.addEventListener("message", (event) => {
                console.log("Received:", event.data.toString());
            });

            ws.addEventListener("close", () => {
                console.log("WebSocket closed");
                resolve();
            });

            ws.addEventListener("error", (err) => {
                console.error("WebSocket error:", err);
                reject(err);
            });
            
            setTimeout(() => {
                ws.close();
                resolve();
            }, 3000);
        });

    } finally {
        await runner.stop();
    }
}

main().catch(console.error);
