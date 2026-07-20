import { describe, it, expect } from "vitest";
import { SilverCompilerAdapter } from "./SilverCompilerAdapter.js";

describe("BL-003A.0 - Covenant Runtime Probe", () => {
    it("should successfully probe the SilverScript compiler capabilities", async () => {
        const adapter = new SilverCompilerAdapter();
        const probeResult = await adapter.probe();

        console.log("Probe Result:", JSON.stringify(probeResult, null, 2));

        expect(probeResult.compilerAvailable).toBe(true);
        expect(probeResult.opcodes.txOutputCount).toBe(true);
        expect(probeResult.opcodes.txOutputSpk).toBe(true);
        
        // As requested by the user, if the compiler doesn't support the opcodes, we should fail or block.
        // We will assert that the compiler supports these opcodes.
        if (probeResult.status === "BLOCKED_BY_COMPILER") {
            throw new Error("Compiler does not support required covenant opcodes");
        }
        
        expect(probeResult.status).toBe("AVAILABLE_EXPERIMENTAL");
    });
});
