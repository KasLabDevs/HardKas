import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { saveDeployment, loadDeployment, listDeployments, updateDeployment, deleteDeployment } from "../src/deployment-store.js";
import { createDeploymentRecord } from "../src/deployment.js";

// DEPLOYMENT-PATH-CONTAINMENT-1 (re-audit 2026-10-04): the deployment store joined the caller's `networkId` and `label`
// into `<ws>/.hardkas/deployments/<networkId>/<label>.json` unvalidated. `deploy track ../../../../x` wrote outside the
// workspace and `deploy track ../../artifacts/x` wrote into the artifact store, bypassing its gate and lock; the same
// joins let load and list read, and delete remove, files elsewhere. A network and a label are each one plain path
// component, and a record's directory must really be under `.hardkas/deployments` (no link out of it); anything else is
// refused before any file is read, written or removed.

let parent: string; // everything a case may touch lives under it
let root: string; // the workspace
let outside: string; // a directory outside the workspace

const deployments = () => path.join(root, ".hardkas", "deployments");
const store = () => path.join(root, ".hardkas", "artifacts");

/** relative path (posix) → sha256 of the bytes, for every file under dir (links are not followed). */
function tree(dir: string): Record<string, string> {
  const res: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) res[path.relative(dir, p).split(path.sep).join("/")] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return res;
}
const rec = (label: string, networkId = "simnet") => createDeploymentRecord({ label, networkId: networkId as any, status: "sent" });
function plant(file: string, body: object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(body));
}

beforeEach(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-deploy-path-"));
  root = path.join(parent, "ws");
  outside = path.join(parent, "outside");
  fs.mkdirSync(deployments(), { recursive: true });
  fs.mkdirSync(outside);
  // an artifact the store holds, and a deployment-looking JSON file outside the workspace
  plant(path.join(store(), "plans", "txPlan-1.json"), { schema: "hardkas.txPlan", label: "store-plan", networkId: "simnet", status: "sent", deployedAt: "2026-10-04T00:00:00.000Z" });
  plant(path.join(outside, "x.json"), { label: "outside-record", networkId: "simnet", status: "sent", deployedAt: "2026-10-04T00:00:00.000Z" });
});

afterEach(() => {
  fs.rmSync(parent, { recursive: true, force: true });
});

const BAD_LABELS: Array<[string, () => string]> = [
  ["a parent-relative label", () => "../escaped"],
  ["a label that reaches into the artifact store", () => "../../artifacts/injected"],
  ["a label that leaves the workspace", () => "../../../../escaped"],
  ["an absolute label", () => path.join(outside, "abs")],
  ["a nested label", () => "a/b"],
  ["a backslash-separated label", () => "a\\b"],
  ["'.'", () => "."],
  ["'..'", () => ".."],
  ["a label with a colon (drive or stream)", () => "x:y"],
  ["a label with NUL", () => "x\0y"]
];

const BAD_NETWORKS: Array<[string, () => string]> = [
  ["a parent-relative network", () => "../escaped-net"],
  ["a network that is the artifact store", () => "../artifacts"],
  ["a network that leaves the workspace", () => "../../../outside"],
  ["an absolute network", () => outside],
  ["a nested network", () => "a/b"],
  ["a backslash-separated network", () => "a\\b"],
  ["'.'", () => "."],
  ["'..'", () => ".."],
  ["a network with a colon (drive or stream)", () => "x:y"]
];

describe("DEPLOYMENT-PATH-CONTAINMENT-1 · a deployment record lives at .hardkas/deployments/<network>/<label>.json", () => {
  it.each(BAD_LABELS)("save refuses %s and writes nothing", async (_what, label) => {
    const before = tree(parent);
    await expect(saveDeployment(root, rec(label()))).rejects.toMatchObject({ code: "DEPLOYMENT_LABEL_INVALID" });
    expect(tree(parent)).toEqual(before);
  });

  it.each(BAD_NETWORKS)("save refuses %s and writes nothing", async (_what, network) => {
    const before = tree(parent);
    await expect(saveDeployment(root, rec("x", network()))).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
    expect(tree(parent)).toEqual(before);
  });

  it("load refuses a label or a network that would read another file", async () => {
    await expect(loadDeployment(root, "simnet", "../../artifacts/plans/txPlan-1")).rejects.toMatchObject({ code: "DEPLOYMENT_LABEL_INVALID" });
    await expect(loadDeployment(root, "../artifacts/plans", "txPlan-1")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
    await expect(loadDeployment(root, "../../../outside", "x")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
  });

  it("list refuses a network that is not one network directory", async () => {
    await expect(listDeployments(root, "../artifacts/plans")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
    await expect(listDeployments(root, "../../../outside")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
  });

  it("delete refuses and removes nothing", async () => {
    const before = tree(parent);
    await expect(deleteDeployment(root, "simnet", "../../artifacts/plans/txPlan-1")).rejects.toMatchObject({ code: "DEPLOYMENT_LABEL_INVALID" });
    await expect(deleteDeployment(root, "../artifacts/plans", "txPlan-1")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
    await expect(deleteDeployment(root, "../../../outside", "x")).rejects.toMatchObject({ code: "DEPLOYMENT_NETWORK_INVALID" });
    expect(tree(parent)).toEqual(before);
  });

  it("update refuses to move a record to an invalid label", async () => {
    await saveDeployment(root, rec("ok"));
    const before = tree(parent);
    await expect(updateDeployment(root, "simnet", "ok", { label: "../../artifacts/evil" })).rejects.toMatchObject({ code: "DEPLOYMENT_LABEL_INVALID" });
    expect(tree(parent)).toEqual(before);
  });

  it("a stored record whose own label is a path is not re-saved there (`deploy status --verify` saves the loaded record)", async () => {
    plant(path.join(deployments(), "simnet", "planted.json"), { ...rec("planted"), label: "../../artifacts/evil" });
    const loaded = await loadDeployment(root, "simnet", "planted");
    expect(loaded?.label).toBe("../../artifacts/evil");
    const before = tree(parent);
    await expect(saveDeployment(root, { ...loaded!, status: "confirmed" })).rejects.toMatchObject({ code: "DEPLOYMENT_LABEL_INVALID" });
    expect(tree(parent)).toEqual(before);
  });

  describe("physical containment: a network directory linked out of .hardkas/deployments", () => {
    it("is refused for a write, and the artifact store it points to is untouched", async () => {
      fs.symlinkSync(store(), path.join(deployments(), "simnet"), "junction");
      const before = tree(parent);
      await expect(saveDeployment(root, rec("x"))).rejects.toMatchObject({ code: "DEPLOYMENT_PATH_OUTSIDE_STORE" });
      expect(tree(parent)).toEqual(before);
    });

    it("is refused for a read, a listing and a delete", async () => {
      fs.symlinkSync(outside, path.join(deployments(), "simnet"), "junction");
      const before = tree(parent);
      await expect(loadDeployment(root, "simnet", "x")).rejects.toMatchObject({ code: "DEPLOYMENT_PATH_OUTSIDE_STORE" });
      await expect(listDeployments(root, "simnet")).rejects.toMatchObject({ code: "DEPLOYMENT_PATH_OUTSIDE_STORE" });
      await expect(listDeployments(root)).rejects.toMatchObject({ code: "DEPLOYMENT_PATH_OUTSIDE_STORE" });
      await expect(deleteDeployment(root, "simnet", "x")).rejects.toMatchObject({ code: "DEPLOYMENT_PATH_OUTSIDE_STORE" });
      expect(tree(parent)).toEqual(before);
    });
  });

  it.each([
    ["simnet", "counter-2026.10.04"],
    ["testnet-10", "my_deploy"],
    ["mainnet", "v1.2"]
  ])("control: %s / %s saves, loads, lists and deletes as before", async (network, label) => {
    const outsideBefore = tree(outside);
    const storeBefore = tree(store());
    const file = await saveDeployment(root, rec(label, network));
    expect(file).toBe(path.join(deployments(), network, `${label}.json`));
    expect((await loadDeployment(root, network, label))?.label).toBe(label);
    expect((await listDeployments(root, network)).map((d) => d.label)).toEqual([label]);
    expect((await listDeployments(root)).map((d) => d.label)).toContain(label);
    expect(await deleteDeployment(root, network, label)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(tree(outside)).toEqual(outsideBefore);
    expect(tree(store())).toEqual(storeBefore);
  });
});
