import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";

// #4 (2026-10-05): `localnet.stop()` on the simulated profile answered "Simulated localnet stopped"
// although the simulator runs no process and nothing was stopped. It now says exactly that.

describe("#4 · SDK localnet.stop() on the simulated profile does not claim a stop", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("reports SIMULATED_LOCALNET_NO_PROCESS and keeps the state", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sdk-localnet-stop-"));
    dirs.push(cwd);
    const hk = await Hardkas.create({ cwd, autoBootstrap: true, network: "simulated" });
    const started = await hk.localnet.start({ profile: "simulated" });
    expect(started.status).toBe("SIMULATED_LOCALNET_READY");
    const stateFile = path.join(cwd, ".hardkas", "localnet.json");
    expect(fs.existsSync(stateFile)).toBe(true);

    const stopped = await hk.localnet.stop({ profile: "simulated" });
    expect(stopped.status).toBe("SIMULATED_LOCALNET_NO_PROCESS");
    expect(stopped.message).toMatch(/Nothing was stopped/);
    expect(stopped.message).not.toMatch(/localnet stopped/i);
    expect(fs.existsSync(stateFile), "the simulator state is untouched").toBe(true);

    // the Docker profile is still reported as not controlled by the SDK
    const docker = await hk.localnet.stop({ profile: "toccata-v2" });
    expect(docker.status).toBe("SDK_LOCALNET_CONTROL_UNSUPPORTED");
  });
});
