import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UI } from "../ui.js";
import { HardkasError } from "@hardkas/core";
export async function runArtifactInspect(options) {
    let targetPath = path.resolve(options.workspaceRoot, options.idOrPath);
    let resolvedById = false;
    const { Hardkas } = await import("@hardkas/sdk");
    if (!fs.existsSync(targetPath)) {
        // Treat as ID and search
        const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
        const artifactsDir = sdk.workspace.artifactsDir;
        if (!fs.existsSync(artifactsDir)) {
            throw new HardkasError("ARTIFACT_NOT_FOUND", `File not found and workspace artifacts directory missing.`);
        }
        const allFiles = [];
        const scanDir = (dir) => {
            if (!fs.existsSync(dir))
                return;
            for (const f of fs.readdirSync(dir)) {
                const fp = path.join(dir, f);
                if (fs.statSync(fp).isDirectory()) {
                    scanDir(fp);
                }
                else if (fp.endsWith(".json")) {
                    allFiles.push(fp);
                }
            }
        };
        scanDir(artifactsDir);
        const matches = [];
        for (const f of allFiles) {
            if (path.basename(f).includes(options.idOrPath)) {
                matches.push(f);
            }
            else {
                try {
                    const content = fs.readFileSync(f, "utf-8");
                    const json = JSON.parse(content);
                    if (json.txId === options.idOrPath ||
                        json.id === options.idOrPath ||
                        json.workflowId === options.idOrPath ||
                        json.planId === options.idOrPath ||
                        json.signedId === options.idOrPath ||
                        json.contentHash?.includes(options.idOrPath)) {
                        matches.push(f);
                    }
                }
                catch (e) { }
            }
        }
        if (matches.length === 0) {
            throw new HardkasError("ARTIFACT_NOT_FOUND", `Could not resolve '${options.idOrPath}' as a file or artifact ID.`);
        }
        else if (matches.length > 1) {
            matches.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            if (!options.json) {
                console.warn(pc.yellow(`  ⚠️  Multiple artifacts matched ID '${options.idOrPath}'. Inspecting the most recent one.`));
            }
            targetPath = matches[0];
            resolvedById = true;
        }
        else {
            targetPath = matches[0];
            resolvedById = true;
        }
    }
    const content = fs.readFileSync(targetPath, "utf-8");
    let artifact;
    try {
        artifact = JSON.parse(content);
    }
    catch (e) {
        throw new HardkasError("INVALID_JSON", `File ${targetPath} is not valid JSON.`);
    }
    const { calculateContentHash } = await import("@hardkas/artifacts");
    const canonicalHash = calculateContentHash(artifact, artifact.hashVersion || 1);
    const type = artifact.schema || artifact.type || "unknown";
    const id = artifact.txId ||
        artifact.workflowId ||
        artifact.id ||
        artifact.planId ||
        artifact.signedId;
    const parents = artifact.parents ||
        artifact.parentTxIds ||
        (artifact.parentTxId ? [artifact.parentTxId] : undefined);
    const lineageId = artifact.lineageId;
    const receiptRef = artifact.receiptId ||
        artifact.receiptPath ||
        (type.includes("txPlan") ? `${artifact.txId}.receipt.json` : undefined);
    const isCoreArtifact = [
        "hardkas.txPlan.v1",
        "hardkas.signedTx.v1",
        "hardkas.txReceipt.v1",
        "hardkas.snapshot"
    ].includes(type);
    const isWorkflow = type === "hardkas.workflow.v1";
    const replayability = isCoreArtifact || isWorkflow ? "supported" : "unknown";
    if (options.json) {
        console.log(JSON.stringify({
            schemaVersion: "hardkas.artifactInspect.v1",
            ok: true,
            artifact: {
                id,
                path: targetPath,
                type,
                canonicalHash,
                parents,
                lineageId,
                receiptRef,
                replayability
            },
            warnings: [],
            errors: []
        }, null, 2));
    }
    else {
        UI.header(`Artifact Inspector`);
        console.log(`  ${pc.bold("Resolved Path:")} ${pc.cyan(path.relative(options.workspaceRoot, targetPath))} ${resolvedById ? pc.dim("(via ID match)") : ""}`);
        console.log(`  ${pc.bold("Schema/Type:")}   ${pc.yellow(type)}`);
        console.log(`  ${pc.bold("Canonical Hash:")} ${pc.magenta(canonicalHash)}`);
        if (id)
            console.log(`  ${pc.bold("Primary ID:")}    ${pc.green(id)}`);
        if (lineageId)
            console.log(`  ${pc.bold("Lineage ID:")}    ${pc.blue(lineageId)}`);
        if (parents && parents.length > 0) {
            console.log(`  ${pc.bold("Parents:")}       ${pc.dim(parents.filter(Boolean).join(", "))}`);
        }
        if (receiptRef)
            console.log(`  ${pc.bold("Receipt Ref:")}   ${pc.dim(receiptRef)}`);
        const repColor = replayability === "supported" ? pc.green : pc.yellow;
        console.log(`  ${pc.bold("Replayability:")} ${repColor(replayability)}\n`);
        UI.printNextSteps([
            `hardkas why ${id || path.basename(targetPath).replace(".json", "")}`
        ]);
    }
}
//# sourceMappingURL=artifact-inspect-runner.js.map