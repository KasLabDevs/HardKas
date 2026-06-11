
import { HARDKAS_VERSION } from "@hardkas/sdk";
import { HardkasSchemas as CoreSchemas } from "@hardkas/core";
import { HardkasSchemas as ArtifactSchemas } from "@hardkas/artifacts";

console.log("SDK Version:", HARDKAS_VERSION);
console.log("Core Schema TxPlan:", CoreSchemas.TxPlan);
console.log("Artifact Schema TxPlan:", ArtifactSchemas.TxPlan);

if (HARDKAS_VERSION !== "0.9.3-alpha") throw new Error("SDK version mismatch");
if (!CoreSchemas.TxPlan) throw new Error("CoreSchemas missing");
if (!ArtifactSchemas.TxPlan) throw new Error("ArtifactSchemas missing");
