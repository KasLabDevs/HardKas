import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const report = await hardkas.vprogs.inspect("fixtures/toccata-v2/vprogs/inspect-only-artifact.json");

console.log(JSON.stringify({
  app: "vprogs-artifact-browser",
  status: report.status,
  artifactSchema: report.artifactSchema,
  claims: report.claims
}, null, 2));
