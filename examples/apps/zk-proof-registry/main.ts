import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const report = await hardkas.zk.corpus.verify("fixtures/toccata-v2/zk");

console.log(JSON.stringify({
  app: "zk-proof-registry",
  status: report.status,
  proofSystems: report.summary.proofSystems,
  claims: report.claims
}, null, 2));
