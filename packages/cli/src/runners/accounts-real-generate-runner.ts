import { 
  loadOrCreateRealAccountStore,
  saveRealAccountStore,
  importRealDevAccount,
  KaspaSdkKeyGenerator,
  RealDevAccount,
  KeystoreManager
} from "@hardkas/accounts";
import path from "node:path";
import { acquirePassword } from "./secrets.js";
import { UI } from "../ui.js";

export interface AccountsRealGenerateOptions {
  name?: string;
  count?: number;
  networkId?: "simnet" | "testnet-10" | "mainnet";
  unsafePlaintext?: boolean;
  passwordStdin?: boolean;
  passwordEnv?: string;
  yes?: boolean;
}

export async function runAccountsRealGenerate(options: AccountsRealGenerateOptions = {}): Promise<{
  accounts: RealDevAccount[];
  formatted: string;
}> {
  const generator = new KaspaSdkKeyGenerator(options.networkId ? { networkId: options.networkId } : {});
  const count = options.count || 1;
  
  let store = await loadOrCreateRealAccountStore();
  const generatedAccounts: RealDevAccount[] = [];

  let password = "";
  if (!options.unsafePlaintext) {
    password = await acquirePassword({
      stdin: options.passwordStdin,
      env: options.passwordEnv,
      message: `Enter password to encrypt ${count} new account(s):`
    });
    if (!password) throw new Error("Password is required for encrypted storage.");
  } else {
    UI.warning("LEGACY MODE: Generating accounts in plaintext is unsafe.");
    if (!options.yes) {
      const confirmed = await UI.confirm("Are you sure you want to store these keys in plaintext?");
      if (!confirmed) throw new Error("Generation cancelled.");
    }
  }

  for (let i = 0; i < count; i++) {
    const name = (count === 1 && options.name) ? options.name : (options.name ? `${options.name}${i + 1}` : `account${i}`);
    
    // Attempt generation
    const generated = await generator.generateAccount(options.networkId ? { networkId: options.networkId } : {});
    
    let keystoreRef: string | undefined;

    if (!options.unsafePlaintext) {
      const keystore = await KeystoreManager.createEncryptedKeystore(
        {
          address: generated.address,
          privateKey: generated.privateKey!,
          network: options.networkId || "simnet"
        },
        password,
        {
          label: name,
          network: options.networkId || "simnet"
        }
      );

      const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");
      const filePath = path.join(keystoreDir, `${name}.json`);
      await KeystoreManager.saveEncryptedKeystore(filePath, keystore);
      keystoreRef = `.hardkas/keystore/${name}.json`;
    }

    store = importRealDevAccount(store, {
      name,
      address: generated.address,
      ...(generated.publicKey ? { publicKey: generated.publicKey } : {}),
      ...(options.unsafePlaintext && generated.privateKey ? { privateKey: generated.privateKey } : {}),
      ...(keystoreRef ? { keystoreRef } : {})
    });
    
    generatedAccounts.push(store.accounts[store.accounts.length - 1]!);
  }

  await saveRealAccountStore(store);

  const lines = [
    `Generated ${count} real dev account(s)`,
    "",
    "WARNING: Development keys only. Do not use on mainnet.",
    ""
  ];

  generatedAccounts.forEach(a => {
    lines.push(`Name:    ${a.name}`);
    lines.push(`Address: ${a.address}`);
    lines.push(`Private: yes (masked)`);
    lines.push("");
  });

  return {
    accounts: generatedAccounts,
    formatted: lines.join("\n")
  };
}
