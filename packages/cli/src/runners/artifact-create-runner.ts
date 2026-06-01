import fs from "node:fs/promises";
import path from "node:path";
import { calculateContentHash } from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";
import { UI } from "../ui.js";

export interface ArtifactCreateOptions {
  type: string;
  input: string;
  out?: string;
  json: boolean;
  workspaceRoot: string;
}

export async function runArtifactCreate(options: ArtifactCreateOptions) {
  const inputPath = path.resolve(options.workspaceRoot, options.input);

  let payloadContent: string;
  try {
    payloadContent = await fs.readFile(inputPath, "utf-8");
  } catch (e) {
    throw new Error(`Failed to read input file at ${inputPath}: ${(e as Error).message}`);
  }

  let payload;
  try {
    payload = JSON.parse(payloadContent);
  } catch (e) {
    throw new Error(`Invalid JSON in input file: ${(e as Error).message}`);
  }

  const schemaValid = true;

  const createdAt = systemRuntimeContext.clock.now();
  const artifactId = `art_${createdAt.toString(36)}_${Math.floor(systemRuntimeContext.random.next() * 10000)}`;

  const artifact = {
    artifactId,
    type: options.type,
    schemaValid,
    payload,
    createdAt
  };

  const contentHash = calculateContentHash(artifact);

  const finalArtifact = {
    ...artifact,
    contentHash
  };

  if (options.out) {
    const outPath = path.resolve(options.workspaceRoot, options.out);
    await fs.writeFile(outPath, JSON.stringify(finalArtifact, null, 2), "utf-8");
  }

  if (options.json) {
    console.log(JSON.stringify(finalArtifact, null, 2));
  } else {
    UI.success(`Artifact created: ${artifactId}`);
    UI.info(`Type: ${options.type}`);
    UI.info(`Hash: ${contentHash}`);
    if (options.out) {
      UI.info(`Saved to: ${options.out}`);
    }
  }
}
