import { 
  loadOrCreateRealAccountStore, 
  saveRealAccountStore, 
  importRealDevAccount,
  KaspaSdkKeyGenerator,
  RealDevAccount
} from "@hardkas/accounts";

export interface AccountsRealGenerateOptions {
  name?: string;
  count?: number;
  networkId?: "simnet" | "testnet-10" | "mainnet";
}

export async function runAccountsRealGenerate(options: AccountsRealGenerateOptions = {}): Promise<{
  accounts: RealDevAccount[];
  formatted: string;
}> {
  const generator = new KaspaSdkKeyGenerator(options.networkId ? { networkId: options.networkId } : {});
  const count = options.count || 1;
  
  let store = await loadOrCreateRealAccountStore();
  const generatedAccounts: RealDevAccount[] = [];

  for (let i = 0; i < count; i++) {
    const name = (count === 1 && options.name) ? options.name : (options.name ? `${options.name}${i + 1}` : `account${i}`);
    
    // Attempt generation
    const generated = await generator.generateAccount(options.networkId ? { networkId: options.networkId } : {});
    
    store = importRealDevAccount(store, {
      name,
      address: generated.address,
      ...(generated.publicKey ? { publicKey: generated.publicKey } : {}),
      ...(generated.privateKey ? { privateKey: generated.privateKey } : {})
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
