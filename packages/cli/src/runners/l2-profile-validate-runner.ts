import { resolveL2Profile, validateL2Profile, EvmJsonRpcClient } from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";

export interface L2ProfileValidateOptions {
  name?: string;
  network?: string;
  url?: string;
  json?: boolean;
}

export async function runL2ProfileValidate(options: L2ProfileValidateOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  const name = options.name || options.network;

  const profile = resolveL2Profile({
    name,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const result = validateL2Profile(profile);
  const errors = [...result.errors];

  let rpcVerified = false;
  // Remote validation if RPC URL is present
  if (profile.rpcUrl) {
    try {
      const client = new EvmJsonRpcClient({ url: profile.rpcUrl });
      const remoteChainId = await client.getChainId();
      
      if (profile.chainId !== undefined && profile.chainId !== remoteChainId) {
        errors.push(`Chain ID mismatch: Profile configured for ${profile.chainId} but RPC returned ${remoteChainId}`);
      } else {
        rpcVerified = true;
      }
    } catch (e: any) {
      // Not a hard failure for general validation, but we should inform
    }
  }

  const finalOk = errors.length === 0;

  if (options.json) {
    console.log(JSON.stringify({ ok: finalOk, errors, profile, rpcVerified }, null, 2));
    return;
  }

  if (finalOk) {
    console.log(`✓ L2 profile '${profile.name}' (${profile.source}) is VALID.`);
    if (rpcVerified) {
      console.log(`  RPC connectivity verified for chainId ${profile.chainId}`);
    } else if (profile.rpcUrl) {
      console.log(`  Note: RPC URL '${profile.rpcUrl}' is configured but currently unreachable.`);
    }
  } else {
    console.log(`✗ L2 profile '${profile.name}' is INVALID:`);
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }
}
