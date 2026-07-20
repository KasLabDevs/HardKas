import { CertificationContext, CertificationGate } from "./types.js";
import { IntegrityGate } from "./gates/integrity.js";
import { TypescriptGate } from "./gates/typescript.js";
import { RustGate } from "./gates/rust.js";
import { RepeatabilityGate } from "./gates/repeatability.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../");

async function main() {
    const args = process.argv.slice(2);
    const labId = args[0];

    if (!labId) {
        console.error("Usage: pnpm certify <lab-id>");
        process.exit(1);
    }

    const labPath = path.join(__dirname, "labs", `${labId}.js`);
    
    // In a full implementation, we'd load lab specifics.
    // For now, we will construct the context directly.
    const manifestPath = path.join(projectRoot, `examples/builder-labs/${labId}/certification.manifest.json`);
    
    // Default manifest if not present
    let manifest = { lab: labId, requiredGates: ["integrity", "typescript", "rust", "repeatability"] };
    try {
        const manifestStr = await fs.readFile(manifestPath, "utf-8");
        manifest = JSON.parse(manifestStr);
    } catch (e) {
        // Fallback to default
    }

    const ctx: CertificationContext = {
        lab: labId,
        projectRoot,
        manifest,
        result: {
            status: "PENDING",
            generatedAt: new Date().toISOString(),
            claims: {
                simnetCertified: true,
                testnetCertified: false,
                mainnetCertified: false,
                productionAudited: false
            }
        }
    };

    const allGates: Record<string, CertificationGate> = {
        "integrity": new IntegrityGate(),
        "typescript": new TypescriptGate(),
        "rust": new RustGate(),
        "repeatability": new RepeatabilityGate()
    };

    console.log(`=== Starting Certification for ${labId} ===`);

    for (const gateName of manifest.requiredGates) {
        const gate = allGates[gateName];
        if (!gate) {
            console.error(`Unknown gate: ${gateName}`);
            process.exit(1);
        }

        const res = await gate.execute(ctx);
        if (!res.success) {
            console.error(`\n[!] Gate ${gateName} FAILED: ${res.error}`);
            ctx.result.status = "FAIL";
            ctx.result.failedGate = gateName;
            break;
        } else {
            console.log(`[+] Gate ${gateName} PASSED.`);
        }
    }

    if (ctx.result.status !== "FAIL") {
        ctx.result.status = "PASS";
    }

    const resultPath = path.join(projectRoot, `examples/builder-labs/${labId}/certification.result.json`);
    await fs.writeFile(resultPath, JSON.stringify(ctx.result, null, 2));

    console.log(`\n=== Certification finished with status: ${ctx.result.status} ===`);
    console.log(`Result saved to ${resultPath}`);
    
    if (ctx.result.status === "FAIL") {
        process.exit(1);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
