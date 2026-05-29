import { UI } from "../ui.js";
import { createHash } from "node:crypto";

export async function runLocalnetAccountCreate(name: string, options: { json: boolean }) {
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

  if (options.json) {
    console.log(JSON.stringify(accountInfo, null, 2));
  } else {
    UI.success(`Simulated account created: ${name}`);
    UI.info(`Address: ${accountInfo.address}`);
    UI.info(`Security Model: ${accountInfo.securityModel}`);
  }
}
