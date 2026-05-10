import { getL2BridgeAssumptions } from "@hardkas/l2";

export interface L2BridgeOptions {
  network?: string;
  json?: boolean;
}

export async function runL2BridgeStatus(options: L2BridgeOptions): Promise<void> {
  const networkName = options.network ?? "igra";
  const assumptions = getL2BridgeAssumptions(networkName);

  if (!assumptions) {
    throw new Error(`No bridge assumptions found for network '${networkName}'.`);
  }

  if (options.json) {
    console.log(JSON.stringify(assumptions, null, 2));
    return;
  }

  console.log(`${capitalize(networkName)} bridge status`);
  console.log("");
  console.log(`Network:        ${assumptions.l2Network}`);
  console.log(`Bridge phase:   ${assumptions.bridgePhase}`);
  console.log(`Trustless exit: ${assumptions.trustlessExit ? "yes" : "no"}`);
  console.log(`Risk:           ${assumptions.riskProfile}`);
  console.log("");
  console.log("Custody:");
  console.log(`  ${assumptions.custodyModel}`);
  console.log("");
  console.log("Exit model:");
  console.log(`  ${assumptions.exitModel}`);
  console.log("");
  console.log("Warnings:");
  for (const note of assumptions.notes) {
    console.log(`  - ${note}`);
  }
}

export async function runL2BridgeAssumptions(options: L2BridgeOptions): Promise<void> {
  const networkName = options.network ?? "igra";
  const assumptions = getL2BridgeAssumptions(networkName);

  if (!assumptions) {
    throw new Error(`No bridge assumptions found for network '${networkName}'.`);
  }

  if (options.json) {
    console.log(JSON.stringify(assumptions, null, 2));
    return;
  }

  console.log(`${capitalize(networkName)} bridge assumptions`);
  console.log("");
  console.log("Bridge security phases:");
  console.log("  pre-ZK: stronger trust assumptions / non-trustless exit");
  console.log("  MPC:    threshold committee trust assumptions");
  console.log("  ZK:     validity-proof based trustless exit");
  console.log("");
  console.log("Current configured phase:");
  console.log(`  ${assumptions.bridgePhase}`);
  console.log("");
  console.log("Trustless exit:");
  console.log(`  ${assumptions.trustlessExit ? "yes" : "no"}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
