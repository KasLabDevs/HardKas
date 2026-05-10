import { 
  resolveHardkasAccount, 
  signTxPlanArtifact 
} from "@hardkas/accounts";
import { 
  TxPlanArtifact, 
  SignedTxArtifact 
} from "@hardkas/artifacts";
import { HardkasConfig } from "@hardkas/config";

export interface TxSignRunnerInput {
  planArtifact: TxPlanArtifact;
  accountName?: string;
  config: HardkasConfig;
  allowMainnetSigning?: boolean;
}

/**
 * Reusable logic for transaction signing.
 */
export async function runTxSign(input: TxSignRunnerInput): Promise<SignedTxArtifact> {
  const { planArtifact, accountName, config, allowMainnetSigning } = input;
  
  const targetAccountName = accountName || planArtifact.from.accountName || planArtifact.from.input || planArtifact.from.address;
  const account = resolveHardkasAccount({ nameOrAddress: targetAccountName, config });

  const signedArtifact = await signTxPlanArtifact({
    planArtifact,
    account,
    config,
    allowMainnet: allowMainnetSigning ?? false
  });

  return signedArtifact;
}
