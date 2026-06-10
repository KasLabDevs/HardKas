import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const report = await hardkas.zk.proof.inspect("fixtures/toccata-v2/zk/groth16");

console.log(
  JSON.stringify(
    {
      app: "zk-identity-claim-demo",
      proofSystem: report.proofSystem,
      status: report.status,
      claims: report.claims
    },
    null,
    2
  )
);
