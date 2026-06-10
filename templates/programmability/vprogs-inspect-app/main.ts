import { Hardkas } from "@hardkas/sdk";

export async function main() {
  const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
  return hardkas.vprogs.inspect("fixtures/toccata-v2/vprogs/inspect-only-artifact.json");
}

console.log(JSON.stringify(await main(), null, 2));
