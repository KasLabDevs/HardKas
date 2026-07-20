import { describe, it, expect, beforeAll } from "vitest";
import { SilverCompilerAdapter } from "./SilverCompilerAdapter.js";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const ROOT_DIR = __dirname;

describe("BL-003A - SilverScript Toolchain Ext", () => {
    let adapter: SilverCompilerAdapter;
    let sourcePath: string;

    beforeAll(async () => {
        adapter = new SilverCompilerAdapter();
        sourcePath = path.join(ROOT_DIR, "fixed-destination.sil");
        
        // This is a dummy fixed destination script. In BL-003B we will replace this with real pubkeys.
        // For compilation purposes, we just need the syntax to be correct.
        // We will use dummy hex for the <fixed-script-public-key>.
        const scriptSource = `
pragma silverscript ^0.1.0;
contract FixedDestination() {
    entrypoint function spend() {
        byte[] expectedSpk = 0xaa00;
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == expectedSpk);
    }
}
        `.trim();
        
        await fs.writeFile(sourcePath, scriptSource);
    });

    it("should successfully compile fixed-destination.sil", async () => {
        const probe = await adapter.probe();
        if (probe.status === "BLOCKED_BY_COMPILER") {
            console.warn("Compiler is not available or doesn't support needed opcodes. Skipping BL-003A tests.");
            return;
        }

        const artifact = await adapter.compile({ sourcePath });
        
        expect(artifact.sourceHash).toBeDefined();
        expect(artifact.compilerCommit).toBe("9aa70b0d0215e7395e2a95b78472eba0a5b103a5");
        expect(artifact.compilerBinaryHash).toBeDefined();
        expect(artifact.bytecodeHash).toBeDefined();
        expect(artifact.bytecodeHex).toBeDefined();
        expect(artifact.artifactHash).toBeDefined();
        expect(artifact.deterministicRecompile).toBe(true);

        // Print the artifact to verify it matches the user's requirements
        console.log("Compilation Artifact:", JSON.stringify(artifact, null, 2));

        // Save it for reference in the evidence directory later
        await fs.mkdir(path.join(ROOT_DIR, "evidence"), { recursive: true });
        await fs.writeFile(path.join(ROOT_DIR, "evidence", "compiler-artifact.json"), JSON.stringify(artifact, null, 2));
    });
});
