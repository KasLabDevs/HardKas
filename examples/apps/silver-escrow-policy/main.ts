import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const report = await hardkas.programmability.inspect({
  kind: "silver",
  path: "fixtures/toccata-v2/silver/op-true/spend-plan.json"
});

console.log(JSON.stringify({
  app: "silver-escrow-policy",
  artifactSchema: report.artifactSchema,
  status: report.status,
  claims: report.claims
}, null, 2));
