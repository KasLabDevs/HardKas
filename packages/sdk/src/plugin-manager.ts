import { HardkasError } from "@hardkas/core";
import type { 
  HardkasPlugin,
  BeforeArtifactWriteContext,
  ArtifactWrittenContext,
  BeforeTxSignContext,
  TxSignedContext,
  BeforeTxSendContext,
  TxSentContext
} from "@hardkas/core";
import type { Hardkas } from "./index.js";

const coreNamespaces = new Set([
  "config",
  "workspaceRoot",
  "mode",
  "policy",
  "accounts",
  "localnet",
  "tx",
  "artifacts",
  "query",
  "replay",
  "evidence",
  "expect",
  "l2",
  "workflow",
  "capabilitiesApi",
  "corpus",
  "silver",
  "zk",
  "vprogs",
  "programmability",
  "plugins",
  "rpc",
  "signer",
  "workspace"
]);

const coreCommandNames = new Set([
  "init",
  "test",
  "tx",
  "evidence",
  "localnet",
  "create",
  "query",
  "artifact",
  "security",
  "programmability"
]);

export class HardkasPluginManager {
  private plugins: HardkasPlugin[] = [];

  constructor(private hk: Hardkas) {}

  public loadPlugins() {
    const plugins = this.hk.sdkConfig.plugins || [];
    if (!Array.isArray(plugins)) {
      throw new HardkasError("CONFIG_ERROR", "plugins array must be an array");
    }

    for (const plugin of plugins) {
      if (!plugin.name || !plugin.version) {
        throw new HardkasError("PLUGIN_ERROR", "Plugin missing name or version");
      }

      // 1. Verify capabilities against active policy
      if (plugin.capabilities) {
        if (plugin.capabilities.requiresNetwork && !this.hk.policy.allowNetwork) {
          throw new HardkasError("POLICY_VIOLATION", `Plugin '${plugin.name}' requires network access, but policy forbids it.`);
        }
        if (plugin.capabilities.requiresMutation && this.hk.policy.requireDryRun) {
          throw new HardkasError("POLICY_VIOLATION", `Plugin '${plugin.name}' requires mutation, but policy forbids it (dry run only).`);
        }
        if (plugin.capabilities.claims?.mainnetReady === false && this.hk.network === "mainnet") {
          throw new HardkasError("POLICY_VIOLATION", `Plugin '${plugin.name}' is not mainnet ready.`);
        }
      }

      // 2. Extend environment
      if (typeof plugin.extendEnvironment === "function") {
        const hkProxy = new Proxy(this.hk, {
          set(target, prop, value) {
            if (coreNamespaces.has(String(prop))) {
              throw new HardkasError(
                "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED",
                `Plugin cannot override hk.${String(prop)}`
              );
            }
            return Reflect.set(target, prop, value);
          },
          deleteProperty(target, prop) {
            if (coreNamespaces.has(String(prop))) {
              throw new HardkasError(
                "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED",
                `Plugin cannot delete hk.${String(prop)}`
              );
            }
            return Reflect.deleteProperty(target, prop);
          },
          defineProperty(target, prop, descriptor) {
            if (coreNamespaces.has(String(prop))) {
              throw new HardkasError(
                "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED",
                `Plugin cannot define hk.${String(prop)}`
              );
            }
            return Reflect.defineProperty(target, prop, descriptor);
          }
        });
        plugin.extendEnvironment(hkProxy);
      }

      // 3. Inject tasks into the active configuration so the CLI can discover them
      if (plugin.tasks) {
        for (const [taskName, taskDef] of Object.entries(plugin.tasks)) {
          if (coreCommandNames.has(taskName)) {
            throw new HardkasError(
              "PLUGIN_CORE_COMMAND_OVERRIDE_BLOCKED",
              `Plugin '${plugin.name}' attempted to register a task with core command name '${taskName}'.`
            );
          }
        }
        this.hk.config.config.tasks = {
          ...plugin.tasks,
          ...this.hk.config.config.tasks // User tasks take precedence over plugin tasks
        };
      }

      this.plugins.push(plugin);
    }
  }

  // --- HOOK DISPATCHERS ---

  private async dispatchBeforeHook<T>(hookName: keyof NonNullable<HardkasPlugin["hooks"]>, ctx: T): Promise<void> {
    for (const plugin of this.plugins) {
      const hookFn = plugin.hooks?.[hookName] as ((c: T) => Promise<void>) | undefined;
      if (typeof hookFn === "function") {
        try {
          await hookFn(ctx);
        } catch (e: any) {
          if (e.code === "PLUGIN_ACTION_BLOCKED") {
            // Write PluginDecision artifact
            await this.hk.artifacts.write({
              schema: "PluginDecision",
              pluginName: plugin.name,
              pluginVersion: plugin.version,
              hook: hookName,
              decision: "blocked",
              reason: e.message,
              timestamp: new Date().toISOString()
            } as any, { internal: true, bypassHooks: true });
            throw e; // Rethrow to halt execution
          }
          throw e; // Unhandled error during before* hook
        }
      }
    }
  }

  private async dispatchAfterHook<T>(hookName: keyof NonNullable<HardkasPlugin["hooks"]>, ctx: T): Promise<void> {
    for (const plugin of this.plugins) {
      const hookFn = plugin.hooks?.[hookName] as ((c: T) => Promise<void>) | undefined;
      if (typeof hookFn === "function") {
        try {
          await hookFn(ctx);
        } catch (e: any) {
          // Write PluginHookFailure artifact
          await this.hk.artifacts.write({
            schema: "PluginHookFailure",
            pluginName: plugin.name,
            pluginVersion: plugin.version,
            hook: hookName,
            error: e.message,
            timestamp: new Date().toISOString()
          } as any, { internal: true, bypassHooks: true });

          // Non-fatal, just log and continue
          if ((this.hk.config as any).logger) {
            (this.hk.config as any).logger.warn(`Plugin '${plugin.name}' failed in hook '${String(hookName)}': ${e.message}`);
          }
        }
      }
    }
  }

  public async onBeforeArtifactWrite(ctx: Omit<BeforeArtifactWriteContext, "hk" | "network">): Promise<void> {
    await this.dispatchBeforeHook("onBeforeArtifactWrite", { ...ctx, hk: this.hk, network: this.hk.network });
  }

  public async onArtifactWritten(ctx: Omit<ArtifactWrittenContext, "hk" | "network">): Promise<void> {
    await this.dispatchAfterHook("onArtifactWritten", { ...ctx, hk: this.hk, network: this.hk.network });
  }

  public async onBeforeTxSign(ctx: Omit<BeforeTxSignContext, "hk" | "network">): Promise<void> {
    await this.dispatchBeforeHook("onBeforeTxSign", { ...ctx, hk: this.hk, network: this.hk.network });
  }

  public async onTxSigned(ctx: Omit<TxSignedContext, "hk" | "network">): Promise<void> {
    await this.dispatchAfterHook("onTxSigned", { ...ctx, hk: this.hk, network: this.hk.network });
  }

  public async onBeforeTxSend(ctx: Omit<BeforeTxSendContext, "hk" | "network">): Promise<void> {
    await this.dispatchBeforeHook("onBeforeTxSend", { ...ctx, hk: this.hk, network: this.hk.network });
  }

  public async onTxSent(ctx: Omit<TxSentContext, "hk" | "network">): Promise<void> {
    await this.dispatchAfterHook("onTxSent", { ...ctx, hk: this.hk, network: this.hk.network });
  }
}
