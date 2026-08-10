import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { KaspaSdkKeyGenerator, loadOrCreateRealAccountStore, saveRealAccountStore, importRealDevAccount } from "@hardkas/accounts";

export async function runLocalnetAccountCreate(name: string, options: { json: boolean }) {
  const generator = new KaspaSdkKeyGenerator({ networkId: "simnet" });
  const generated = await generator.generateAccount({ networkId: "simnet" });

  const cwd = process.cwd();
  let store = await loadOrCreateRealAccountStore({ cwd });

  store = importRealDevAccount(store, {
    name,
    address: generated.address,
    ...(generated.publicKey ? { publicKey: generated.publicKey } : {}),
    ...(generated.privateKey ? { privateKey: generated.privateKey } : {})
  });

  await saveRealAccountStore(store, { cwd });

  const accountInfo = {
    accountName: name,
    address: generated.address,
    securityModel: "localnet-plaintext"
  };

  if (options.json) {
    getOutput().writeJson(accountInfo);
  } else {
    UI.success(`Localnet account created: ${name}`);
    UI.info(`Address: ${accountInfo.address}`);
    UI.warning(`Security Model: ${accountInfo.securityModel} (Do not use on mainnet)`);
  }
}
