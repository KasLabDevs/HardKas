import { ArtifactPayload } from "@hardkas/artifacts";
import fc from "fast-check";

/**
 * Fuzzing utilities for HardKAS 0.8.12-alpha
 */

export function mutateArtifact(artifact: any): any {
  const clone = JSON.parse(JSON.stringify(artifact));
  const keys = Object.keys(clone);
  if (keys.length === 0) return clone;
  
  const keyToMutate = keys[Math.floor(Math.random() * keys.length)] as string;
  
  const type = typeof clone[keyToMutate];
  if (type === "string") clone[keyToMutate] += "mutated";
  else if (type === "number") clone[keyToMutate] += 1;
  else if (type === "boolean") clone[keyToMutate] = !clone[keyToMutate];
  else if (Array.isArray(clone[keyToMutate])) clone[keyToMutate].push({ mutated: true });
  else if (clone[keyToMutate] === null) clone[keyToMutate] = "mutated";
  
  return clone;
}

export function writeReport(name: string, data: any) {
  const fs = require("fs");
  const path = require("path");
  const dir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));
}
