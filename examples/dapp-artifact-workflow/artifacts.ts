/**
 * HardKAS Example: Artifact Workflow
 *
 * Demonstrates how to interact with the canonical artifacts
 * via the dev-server API.
 */
import { createHardkasClient } from "@hardkas/sdk";

async function main() {
  const client = createHardkasClient({ baseUrl: "http://127.0.0.1:7420" });

  console.log("Fetching Dev Server Status...");
  const status = await client.dev.status();
  console.log("Status:", status.data);

  // We rely on the localnet transfer having been run already, or we fetch known artifacts
  // In a real app, you would query /api/artifacts
  const res = await fetch("http://127.0.0.1:7420/api/artifacts");
  const data = await res.json();

  if (data.artifacts && data.artifacts.length > 0) {
    const latest = data.artifacts[0];
    console.log(`\nFound artifact: ${latest.artifactId} (${latest.schema})`);

    console.log(`Explaining artifact...`);
    const explanation = await client.artifacts.explain(latest.artifactId);
    console.log(explanation.data.explanation);
  } else {
    console.log("No artifacts found. Run the local transfer demo first.");
  }
}

main().catch(console.error);
