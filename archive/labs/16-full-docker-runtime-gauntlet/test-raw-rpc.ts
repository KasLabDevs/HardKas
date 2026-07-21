import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";

async function main() {
    const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
    await client.connect();
    
    try {
        console.log("Calling getUtxosByAddresses...");
        const res = await client.request("getUtxosByAddresses", { addresses: ["kaspasim:qzr380cvw26xem5qlytdzrtf6r9twn4ksr49pzwgysvj359m4h3ms6m6k7p2d"] });
        console.log("Result:", res);
    } catch (e) {
        console.error("Error with addresses:", e);
    }

    try {
        console.log("Calling getUtxosByAddressesRequest directly...");
        const res = await client.request("getUtxosByAddressesRequest", { addresses: ["kaspasim:qzr380cvw26xem5qlytdzrtf6r9twn4ksr49pzwgysvj359m4h3ms6m6k7p2d"] });
        console.log("Result:", res);
    } catch (e) {
        console.error("Error with addresses directly:", e);
    }

    await client.disconnect();
}

main().catch(console.error);
