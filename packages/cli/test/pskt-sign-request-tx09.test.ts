import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// TX-09 · `hardkas pskt sign` passed `privateKey` (no adapter reads it) and `inputIndexes: []` (every adapter refuses
// it), so the command could never sign. Now: `keyMaterial` bytes, the inputs the participant is eligible for (or
// `--inputs`), never an empty list; the key buffer is zeroed afterwards. pskt.signSession is a stand-in here.

const seen: any[] = [];
vi.mock("@hardkas/sdk", async () => {
  const actual: any = await vi.importActual("@hardkas/sdk");
  return {
    ...actual,
    pskt: {
      ...actual.pskt,
      deserializeSession: (json: string) => JSON.parse(json),
      // A1: the signer's network and node checks are covered by pskt-sign-signer-network-a1.test.ts; a stand-in here
      assertSessionSignable: async () => undefined,
      signSession: async (session: any, request: any) => {
        seen.push({ keyLength: request.keyMaterial?.length, keyIsBytes: request.keyMaterial instanceof Uint8Array, inputIndexes: request.inputIndexes, hasPrivateKey: "privateKey" in request, key: request.keyMaterial });
        return session;
      }
    }
  };
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tx09-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const sessionFile = path.join(dir, "session.json");
fs.writeFileSync(sessionFile, JSON.stringify({ kind: "hardkas-portable-signing-session", schemaVersion: 1, networkId: "simnet", requirements: [{ inputIndex: 0, threshold: 1, eligibleParticipants: ["alice"], fulfilledBy: [] }, { inputIndex: 2, threshold: 1, eligibleParticipants: ["bob"], fulfilledBy: [] }] }));
const keyFile = path.join(dir, "key.txt");
fs.writeFileSync(keyFile, "11".repeat(32));

describe("TX-09 · hardkas pskt sign builds a request the adapters accept", () => {
  it("keyMaterial (32 bytes, zeroed after), the participant's eligible inputs, no `privateKey` field", async () => {
    const { runPsktSign } = await import("../src/runners/pskt/mutating.js");
    await runPsktSign(sessionFile, { account: "alice", privateKeyFile: keyFile, network: "simnet", out: path.join(dir, "out1.json"), force: true, json: true });
    expect(seen[0]).toMatchObject({ keyLength: 32, keyIsBytes: true, inputIndexes: [0], hasPrivateKey: false });
    expect([...seen[0].key].every((b: number) => b === 0)).toBe(true);
  });

  it("--inputs chooses explicitly; an unknown participant without --inputs is refused before signing", async () => {
    const { runPsktSign, psktInputsToSign } = await import("../src/runners/pskt/mutating.js");
    await runPsktSign(sessionFile, { account: "carol", privateKeyFile: keyFile, inputs: "2,0", network: "simnet", out: path.join(dir, "out2.json"), force: true, json: true });
    expect(seen[1].inputIndexes).toEqual([2, 0]);
    expect(() => psktInputsToSign({ requirements: [] }, "carol")).toThrow(/eligible signer/);
    expect(() => psktInputsToSign({ requirements: [] }, "carol", "a,1")).toThrow(/distinct input indexes/);
  });
});
