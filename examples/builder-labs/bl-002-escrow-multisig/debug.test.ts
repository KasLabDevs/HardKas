import { describe, it } from "vitest";
import { hardkas } from "./tools/SilverBridge.js";
import path from "node:path";

describe("Debug unlocking script", () => {
    it("should print unlock string", async () => {
        const ROOT_DIR = __dirname;
        const unlockRes = await hardkas.experimental.silver.buildUnlock({
            artifactPath: path.join(ROOT_DIR, "escrow.json"),
            entrypoint: "mutualRelease",
            arguments: ["00".repeat(65), "00".repeat(65)]
        });
        
        console.log("UNLOCK SCRIPT:", unlockRes.unlockingScriptHex);
    });
});
