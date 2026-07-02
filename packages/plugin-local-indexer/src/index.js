import fs from "node:fs";
import path from "node:path";
import { task } from "@hardkas/core";
export class LocalIndexerApi {
    hk;
    options;
    constructor(hk, options) {
        this.hk = hk;
        this.options = options;
    }
    getIndexDir() {
        return path.join(this.hk.cwd, ".hardkas", "indexer");
    }
    getIndexPath() {
        return path.join(this.getIndexDir(), "artifacts.jsonl");
    }
    async process(artifact) {
        const dir = this.getIndexDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const entry = {
            timestamp: new Date().toISOString(),
            schema: artifact.schema || "unknown",
            artifactId: artifact.artifactId || artifact.contentHash || "unknown",
            networkId: artifact.networkId || "unknown",
            mode: artifact.mode || "unknown"
        };
        // hardkas-append-allow
        fs.appendFileSync(this.getIndexPath(), JSON.stringify(entry) + "\n", "utf-8");
    }
    getIndexedCount() {
        const p = this.getIndexPath();
        if (!fs.existsSync(p))
            return 0;
        const content = fs.readFileSync(p, "utf-8");
        return content.trim().split("\n").filter(Boolean).length;
    }
}
export function localIndexerPlugin(options) {
    return {
        name: "@hardkas/plugin-local-indexer",
        version: "0.11.2-alpha",
        hardkasVersion: "0.11.2-alpha",
        capabilities: {
            requiresNetwork: false,
            requiresMutation: false
        },
        tasks: {
            "indexer:status": task("indexer:status", "Shows the local indexer status")
                .action(async (args, hk) => {
                const count = hk.indexer.getIndexedCount();
                return { status: "active", indexedArtifacts: count };
            })
        },
        extendEnvironment: (hk) => {
            hk.indexer = new LocalIndexerApi(hk, options);
        },
        hooks: {
            onArtifactWritten: async (ctx) => {
                await ctx.hk.indexer.process(ctx.artifact);
            }
        }
    };
}
