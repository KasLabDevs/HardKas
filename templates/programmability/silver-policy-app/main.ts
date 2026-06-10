import { Hardkas } from "@hardkas/sdk";

export async function main() {
  const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
  return hardkas.programmability.verify({
    kind: "silver",
    path: "fixtures/toccata-v2/silver/op-true/deploy-plan.json"
  });
}

console.log(JSON.stringify(await main(), null, 2));
