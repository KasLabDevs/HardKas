// L1-CORE-1 B4 · dag status: executed (not --help) through the built CLI. Outside a workspace it reports and writes
// nothing; in a simulated workspace it reports "not initialized" until `dag simulate-reorg` builds the light-model DAG,
// and then it shows exactly the DAG the simulator wrote to .hardkas/localnet.json.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cli, simulatedWorkspace, removeDir, tempDir, listFiles } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("dag status", () => {
  let parent: string;
  let ws: string;
  let empty: string;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-dag-status-"));
    empty = tempDir("hk-b4-dag-status-empty-");
  });
  afterAll(() => {
    removeDir(parent);
    removeDir(empty);
  });

  it("in a directory with no simulated state: exit 0, says there is no DAG, and writes nothing there", () => {
    const r = cli(["dag", "status"], empty);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.stdout).toMatch(/not initialized|no simulated state/i);
    expect(listFiles(empty)).toEqual([]);
  });

  it("in a simulated workspace before any DAG operation: not initialized, exit 0, the state file byte-identical", () => {
    const state = path.join(ws, ".hardkas", "localnet.json");
    const before = fs.readFileSync(state, "utf8");
    const r = cli(["dag", "status"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.stdout).toMatch(/DAG simulation is not initialized/);
    expect(fs.readFileSync(state, "utf8")).toBe(before);
  });

  it("after `dag simulate-reorg --depth 1`: shows the mode, sink, block count, selected path and tx sets the state file holds", () => {
    const reorg = cli(["dag", "simulate-reorg", "--depth", "1"], ws);
    expect(reorg.status, reorg.all.slice(0, 600)).toBe(0);
    const dag = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8")).dag;
    expect(dag?.sink).toBeTruthy();

    const r = cli(["dag", "status"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const field = (name: string) => new RegExp(`${name}\\s+(.+)`).exec(r.stdout)?.[1]?.trim();
    expect({
      mode: field("Mode"),
      sink: field("Sink"),
      blocks: field("Blocks"),
      path: field("Selected Path")
    }).toEqual({
      mode: "dag-light",
      sink: dag.sink,
      blocks: String(Object.keys(dag.blocks).length),
      path: dag.selectedPathToSink.join(" -> ")
    });
    expect(r.stdout).toMatch(new RegExp(`Accepted Transactions \\(${dag.acceptedTxIds.length}\\)`));
    expect(r.stdout).toMatch(new RegExp(`Displaced Transactions \\(${dag.displacedTxIds.length}\\)`));
  });
});
