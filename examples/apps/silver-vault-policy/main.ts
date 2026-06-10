import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const report = await hardkas.programmability.verify({
  kind: "silver",
  path: "fixtures/toccata-v2/silver/op-true/deploy-plan.json"
});

console.log(JSON.stringify({
  app: "silver-vault-policy",
  status: report.ok ? "PASS" : "FAIL",
  claims: report.claims
}, null, 2));
