import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { createHash } from "node:crypto";
import { appendToKeystoreJson } from "@hardkas/accounts";

export async function runSimulatorAccountCreate(name: string, options: { json: boolean }) {
  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  try {
    const existing = resolveHardkasAccount({ nameOrAddress: name });
    if (existing) {
      throw new Error(`Account '${name}' already exists (kind: ${existing.kind}). Cannot overwrite existing accounts.`);
    }
  } catch (e: any) {
    if (!e.message.includes("Unknown HardKAS account")) {
      throw e;
    }
  }

  const hash = createHash("sha256").update(name).digest("hex");
  const shortHash = hash.substring(0, 16);

  const accountInfo = {
    accountName: name,
    address: `kaspa:sim_${name}`,
    publicKey: `sim_pub_${shortHash}`,
    privateKey: `sim_priv_${hash}`,
    securityModel: "simulated-only",
    rpc: "disabled",
    wasm: "disabled"
  };

  await appendToKeystoreJson(process.cwd(), name, {
    address: accountInfo.address,
    type: "simulated"
  });

  if (options.json) {
    getOutput().writeJson(accountInfo);
  } else {
    UI.success(`Simulated account created: ${name}`);
    UI.info(`Address: ${accountInfo.address}`);
    UI.info(`Security Model: ${accountInfo.securityModel}`);
  }
}
