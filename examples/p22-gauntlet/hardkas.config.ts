import { HardkasPlugin, task } from "@hardkas/core";
import { localIndexerPlugin } from "@hardkas/plugin-local-indexer";

const gauntletAdversaryPlugin: HardkasPlugin = {
  name: "GauntletAdversary",
  version: "1.0.0",
  hardkasVersion: "0.10.0",
  hooks: {
    onBeforeArtifactWrite: async (ctx) => {
      // Assert 4: before* hook bloquea y genera PluginDecision
      if (ctx.artifact.schema === "BlockMe") {
        throw Object.assign(new Error("Intentionally blocked by adversary"), { code: "PLUGIN_ACTION_BLOCKED" });
      }
    },
    onArtifactWritten: async (ctx) => {
      // Assert 5: after* hook falla sin romper flujo
      if (ctx.artifact.schema === "FailAfter") {
        throw new Error("Intentional after-hook failure");
      }
    }
  },
  extendEnvironment: (hk: any) => {
    // Assert 1: Plugin no puede sobrescribir hk.tx/hk.accounts
    try {
      hk.tx = {} as any;
      hk.gauntlet_assert1 = "FAILED";
    } catch (e: any) {
      hk.gauntlet_assert1 = e.code === "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED" ? "PASS" : e.message;
    }

    // Assert 2: Plugin no puede borrar namespace core
    try {
      delete hk.accounts;
      hk.gauntlet_assert2 = "FAILED";
    } catch (e: any) {
      hk.gauntlet_assert2 = e.code === "PLUGIN_CORE_NAMESPACE_OVERRIDE_BLOCKED" ? "PASS" : e.message;
    }

    // Allow setting non-core namespaces
    hk.gauntletPluginLoaded = true;
    
    // Assert 9 (Part A): deterministic hook order. We will set a value that a subsequent plugin overrides.
    hk.gauntlet_assert9_value = 1;
  },
  tasks: {
    // Assert 6: Plugin tasks generan TaskResult + Evidence
    "adversary-task": task("adversary-task", "A task that returns something")
      .param("input", "An input string", "string")
      .action(async (args, ctx) => {
        return { success: true, result: args.input };
      }),
  }
};

const gauntletAssert9Plugin: HardkasPlugin = {
  name: "GauntletAssert9",
  version: "1.0.0",
  hardkasVersion: "0.10.0",
  extendEnvironment: (hk: any) => {
    // Assert 9 (Part B): this plugin runs after adversary plugin, so it sees 1 and overrides to 2
    if (hk.gauntlet_assert9_value === 1) {
      hk.gauntlet_assert9_value = 2;
      hk.gauntlet_assert9 = "PASS";
    } else {
      hk.gauntlet_assert9 = "FAILED";
    }
  }
};

const gauntletAssert10Plugin: HardkasPlugin = {
  name: "GauntletAssert10",
  version: "1.0.0",
  hardkasVersion: "0.10.0",
  tasks: {
    // Assert 10: Plugin no puede registrar task con nombre de comando core
    "init": task("init", "Should fail to register")
      .action(async () => ({}))
  }
};

// We will only load the 10-failing plugin dynamically if needed, 
// because loading it in config will crash `Hardkas.open()` entirely.

export default {
  defaultNetwork: "simnet",
  plugins: [gauntletAdversaryPlugin, gauntletAssert9Plugin, localIndexerPlugin()]
};
