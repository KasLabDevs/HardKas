import { Hardkas } from "@hardkas/sdk";
import { createKaspaP2shBlake2bLock, createPushOnlySignatureScript } from "@hardkas/core";
import { SilverDeployPlanArtifactSchema } from "@hardkas/artifacts";

async function main() {
    try {
        console.log("Testing @hardkas/sdk import...");
        if (!Hardkas) throw new Error("Hardkas SDK export missing");
        
        console.log("Testing @hardkas/core imports...");
        if (typeof createKaspaP2shBlake2bLock !== "function") throw new Error("createKaspaP2shBlake2bLock missing");
        if (typeof createPushOnlySignatureScript !== "function") throw new Error("createPushOnlySignatureScript missing");

        console.log("Testing @hardkas/artifacts imports...");
        if (!SilverDeployPlanArtifactSchema) throw new Error("SilverDeployPlanArtifactSchema missing");

        console.log("Testing CLI load...");
        const { execSync } = await import("child_process");
        const cliOut = execSync("npx hardkas --help", { encoding: "utf8" });
        if (!cliOut.includes("silver")) throw new Error("CLI does not include silver command");

        console.log("PASS: FASE 1");
    } catch (err) {
        console.error("FAIL: FASE 1", err);
        process.exit(1);
    }
}

main();
