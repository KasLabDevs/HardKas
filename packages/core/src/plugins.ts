import type { TaskDefinition } from "./tasks.js";


export interface HardkasPluginHooks {
  onBeforeArtifactWrite?: (ctx: BeforeArtifactWriteContext) => Promise<void>;
  onArtifactWritten?: (ctx: ArtifactWrittenContext) => Promise<void>;
  
  onBeforeTxSign?: (ctx: BeforeTxSignContext) => Promise<void>;
  onTxSigned?: (ctx: TxSignedContext) => Promise<void>;
  
  onBeforeTxSend?: (ctx: BeforeTxSendContext) => Promise<void>;
  onTxSent?: (ctx: TxSentContext) => Promise<void>;
}

export interface HardkasPlugin {
  name: string;
  version: string;
  hardkasVersion: string;
  capabilities?: {
    requiresNetwork?: boolean;
    requiresMutation?: boolean;
    claims?: {
      mainnetReady?: boolean;
    };
  };
  tasks?: Record<string, TaskDefinition<any, any>>;
  hooks?: HardkasPluginHooks;
  extendEnvironment?: (hk: any) => void;
}

export interface BaseHookContext {
  hk: any; // HardkasEnvironment
  network: string;
}

export interface BeforeArtifactWriteContext extends BaseHookContext {
  artifact: any;
  options: any;
}

export interface ArtifactWrittenContext extends BaseHookContext {
  artifact: any;
  absolutePath: string;
}

export interface BeforeTxSignContext extends BaseHookContext {
  planId: string;
  account: string;
}

export interface TxSignedContext extends BaseHookContext {
  planId: string;
  account: string;
  signedArtifact: any;
}

export interface BeforeTxSendContext extends BaseHookContext {
  signedTxId?: string;
  from?: string;
}

export interface TxSentContext extends BaseHookContext {
  signedTxId?: string;
  receiptArtifact: any;
}

/** 
 * Extend HardkasError to include plugin errors 
 * (We don't actually redefine it, just ensure these codes are handled where thrown)
 * PLUGIN_ACTION_BLOCKED
 * PLUGIN_HOOK_FAILED
 * BYPASS_HOOKS_FORBIDDEN
 */

export interface BackendPlugin {
  name: string;
  type: string;
  capabilities: {
    snapshots: boolean;
    deterministic: boolean;
    externalState: boolean;
  };
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
}
