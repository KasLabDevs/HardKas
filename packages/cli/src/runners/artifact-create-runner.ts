import fs from "node:fs/promises";
import path from "node:path";
import { calculateContentHash, CURRENT_HASH_VERSION, writeFileRespectingStore } from "@hardkas/artifacts";
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

  // ESCALÓN 2 · P11: nothing validates this payload. <type> is a free label, not a schema of the artifact registry, and
  // the wrapper written here has no `schema` for the registry's validator to check, so the artifact says
  // NOT_VALIDATED. It used to carry a fixed `schemaValid: true`.
  const schemaValidation = "NOT_VALIDATED" as const;

  const createdAt = systemRuntimeContext.clock.now();

  // IC-7.3: the artifact's only identity is its recomputed contentHash; no
  // random top-level artifactId is written (createdAt is operational, IC-1′.1b).
  const artifact = {
    type: options.type,
    schemaValidation,
    payload,
    createdAt,
    hashVersion: CURRENT_HASH_VERSION
  };

  const contentHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);

  const finalArtifact = {
    ...artifact,
    contentHash
  };

  if (options.out) {
    const outPath = path.resolve(options.workspaceRoot, options.out);
    const data = JSON.stringify(finalArtifact, null, 2);
    // an --out inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
    await writeFileRespectingStore(outPath, data, () => fs.writeFile(outPath, data, "utf-8"));
  }

  if (options.json) {
    console.log(JSON.stringify(finalArtifact, null, 2));
  } else {
    UI.success(`Artifact created: ${contentHash}`);
    UI.info(`Type: ${options.type}`);
    UI.info(`Hash: ${contentHash}`);
    UI.info(`Schema: ${schemaValidation} (the payload is wrapped as given; '${options.type}' is a label, not a validated schema)`);
    if (options.out) {
      UI.info(`Saved to: ${options.out}`);
    }
  }
}
