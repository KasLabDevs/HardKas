import type { HardkasPlugin, ArtifactWrittenContext, TaskDefinition } from "@hardkas/core";
import fs from "node:fs";
import path from "node:path";
import { task } from "@hardkas/core";

export interface LocalIndexerOptions {
  // Config options if any
}

export class LocalIndexerApi {
  constructor(private hk: any, private options?: LocalIndexerOptions) {}

  public getIndexDir() {
    return path.join(this.hk.cwd, ".hardkas", "indexer");
  }

  public getIndexPath() {
    return path.join(this.getIndexDir(), "artifacts.jsonl");
  }

  public async process(artifact: any) {
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

  public getIndexedCount(): number {
    const p = this.getIndexPath();
    if (!fs.existsSync(p)) return 0;
    const content = fs.readFileSync(p, "utf-8");
    return content.trim().split("\n").filter(Boolean).length;
  }
}

export function localIndexerPlugin(options?: LocalIndexerOptions): HardkasPlugin {
  return {
    name: "@hardkas/plugin-local-indexer",
    version: "0.11.1-alpha",
    hardkasVersion: "0.11.1-alpha",
    capabilities: {
      requiresNetwork: false,
      requiresMutation: false
    },
    tasks: {
      "indexer:status": task("indexer:status", "Shows the local indexer status")
        .action(async (args, hk: any) => {
          const count = hk.indexer.getIndexedCount();
          return { status: "active", indexedArtifacts: count };
        })
    },
    extendEnvironment: (hk: any) => {
      hk.indexer = new LocalIndexerApi(hk, options);
    },
    hooks: {
      onArtifactWritten: async (ctx: ArtifactWrittenContext) => {
        await ctx.hk.indexer.process(ctx.artifact);
      }
    }
  };
}
