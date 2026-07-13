import { test as vitestTest, expect as vitestExpect } from "vitest";
import { Hardkas, createHardkasEnvironment, type HardkasEnvironment } from "@hardkas/sdk";

const isVitest = typeof process !== "undefined" && process.env.VITEST === "true";

/**
 * Re-export vitest expect.
 */
export const expect = isVitest ? vitestExpect : (() => {
  throw new Error("expect is only available within a vitest execution.");
}) as any;

/**
 * HardKAS Scenario Bridge
 * 
 * Extends Vitest's `test` to automatically inject the HardKAS Environment (`hk`)
 * specifically tailored for the local scenario being run.
 */
export const scenario = isVitest ? vitestTest.extend<{ hk: HardkasEnvironment }>({
  hk: async ({ task }, use) => {
    const fs = await import("fs");
    const path = await import("path");

    const safeScenarioName = task.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const runId = `${safeScenarioName}_${timestamp}_${randomSuffix}`;
    const runsDir = path.join(process.cwd(), ".hardkas", "runs", runId);
    
    fs.mkdirSync(runsDir, { recursive: true });

    // 1. We boot the HardKAS SDK in "test" mode with an isolated run directory
    const hardkas = await Hardkas.open({ 
      mode: "agent", 
      autoBootstrap: true,
      hardkasDir: runsDir 
    });
    
    const hk = createHardkasEnvironment({
      config: hardkas.sdkConfig,
      workspaceRoot: hardkas.cwd,
      mode: "test",
      policy: hardkas.policy,
      expectFn: expect
    });

    hk.accounts = hardkas.accounts as any;
    hk.localnet = hardkas.localnet as any;
    hk.tx = hardkas.tx as any;
    hk.artifacts = hardkas.artifacts as any;

    const { coreEvents, HardkasSchemas } = await import("@hardkas/core");

    const generatedArtifacts = new Set<string>();
    const onCreated = (ev: any) => {
      if (ev.kind === "artifact.created" || ev.kind === "artifact.written") {
        if (ev.artifactId) {
          generatedArtifacts.add(ev.artifactId);
        }
      }
    };
    const unsubscribe = coreEvents.on(onCreated);

    // Provide hk to the test
    let scenarioError: any = null;
    try {
      await use(hk);
    } catch (e) {
      scenarioError = e;
    } finally {
      unsubscribe();

      const mainArtifactsDir = path.join(process.cwd(), ".hardkas", "artifacts");
      fs.mkdirSync(mainArtifactsDir, { recursive: true });

      // Fallback scan of the run directory artifacts
      const runArtifactsDir = path.join(runsDir, "artifacts");
      if (fs.existsSync(runArtifactsDir)) {
        const files = fs.readdirSync(runArtifactsDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const id = file.replace(".json", "");
            if (id.length > 10) {
               generatedArtifacts.add(id);
            }
            // Copy artifact to the main artifacts folder so evidence pack works
            fs.copyFileSync(
              path.join(runArtifactsDir, file),
              path.join(mainArtifactsDir, file)
            );
          }
        }
      }

      const state = task.result?.state;
      const status = state === "fail" ? "failed" : "passed";
      const vitestError = task.result?.errors?.[0];
      
      const errorToSave = scenarioError || vitestError;

      let errorObj = undefined;
      if (status === "failed" && errorToSave) {
        let msg = "Unknown error";
        if (errorToSave instanceof Error) msg = errorToSave.message;
        else if (errorToSave && typeof errorToSave.message === "string") msg = errorToSave.message;
        else {
          try { msg = String(errorToSave); } catch { msg = "Unserializable error object"; }
        }

        errorObj = {
          code: (errorToSave as any).code || (errorToSave as any).name || "SCENARIO_FAIL",
          message: msg,
          component: (errorToSave as any).component || "scenario",
          recoverable: false
        };
      }

      const safeScenarioName = task.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      const scenarioResult = {
        schema: (HardkasSchemas as any).ScenarioResultV1 || "hardkas.scenarioResult.v1",
        hardkasVersion: "0.11.3-alpha",
        version: "1.0.0-alpha",
        networkId: hardkas.network || "simnet",
        mode: "agent",
        createdAt: new Date().toISOString(),
        scenarioName: task.name,
        status,
        artifactsGenerated: Array.from(generatedArtifacts).filter(id => id !== safeScenarioName),
        error: errorObj,
        claims: {
          mainnet: false,
          testnet: false,
          production: false
        }
      };

      fs.writeFileSync(
        path.join(runsDir, "scenario-result.json"), 
        JSON.stringify(scenarioResult, null, 2)
      );

      const resultPath = path.join(mainArtifactsDir, `${safeScenarioName}.scenario-result.json`);
      fs.writeFileSync(
        resultPath,
        JSON.stringify(scenarioResult, null, 2)
      );
      
      coreEvents.normalizeAndEmit({
        kind: "artifact.created",
        schema: (HardkasSchemas as any).ScenarioResultV1 || "hardkas.scenarioResult.v1",
        artifactId: safeScenarioName,
        network: hardkas.network,
        mode: "test",
        path: resultPath
      } as any);

      // Record for the test runner to pick up
      const testRunDir = process.env.HARDKAS_TEST_RUN_DIR;
      if (testRunDir) {
        const scenarioResultsDir = path.join(testRunDir, "scenario-results");
        if (fs.existsSync(scenarioResultsDir)) {
          fs.writeFileSync(
            path.join(scenarioResultsDir, `${safeScenarioName}.json`),
            JSON.stringify({ scenarioResultPath: resultPath }, null, 2)
          );
        }
      }

      // Cleanup
      if (process.env.HARDKAS_KEEP_RUNS !== "true") {
        fs.rmSync(runsDir, { recursive: true, force: true });
      }
    }
  }
}) : (() => {
  throw new Error("scenario is only available within a vitest execution.");
}) as any;
