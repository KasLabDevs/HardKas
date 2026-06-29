import { IndexerToolkit } from "@hardkas/toolkit";
import { kaspaRpcBackendPlugin } from "@hardkas/plugin-rpc-backend";

async function main() {
    console.log("=== LAB 15: REAL BACKEND PLUGIN PROTOTYPE ===");

    // Fricciones:
    // IndexerToolkit.open() doesn't accept plugins today.
    // We mock it for the lab by force-injecting or seeing how it would look.
    // We will cast to any to simulate what P50 needs to enable in TypeScript.

    // 2. Enchufarlo a un Toolkit existente.
    const indexer = IndexerToolkit.open({
        backend: kaspaRpcBackendPlugin({
            url: "ws://127.0.0.1:18210"
        })
    });

    await indexer.connect();

    // Validar que la app no cambia sus imports (se usa IndexerToolkit normal).
    console.log("Indexer instance:", typeof indexer);
    
    // Simulate what the indexer *would* do inside if it had plugin support.
    // Fricción a capturar: La lógica interna de indexer.ts asume "this.projection.get()".
    // El plugin framework de P50 tendrá que interceptar llamadas como `indexer.balance()`
    // y delegarlas al plugin.
    
    console.log("Lab done. See FRICTIONS.md");
}

main().catch(console.error);
