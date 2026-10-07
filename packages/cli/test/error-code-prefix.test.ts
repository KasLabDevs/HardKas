import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";
import { handleError, handleLockError } from "../src/ui.js";

// PAPERCUTS-1 · about 90 places throw `new Error("SOME_CODE: …")` without setting `.code`; the CLI's error envelope
// only read `.code`, so all of them surfaced as `code: "UNKNOWN_ERROR"` with the real code buried in the message.
// The envelope takes `.code` when there is one, else a leading `CODE_X:` of the message, else UNKNOWN_ERROR.

describe("CLI error envelope · the code of an error", () => {
  let stdout: string[];

  beforeEach(() => {
    stdout = [];
    setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: (s: string) => void stdout.push(s) }, stderr: { write: () => {} } }));
  });

  afterEach(() => {
    setGlobalOutput(createCommandOutput({ mode: "human" }));
    // CLI-RUNTIME-CONTRACT-1: handleError now records the failure in process.exitCode; keep the worker clean.
    process.exitCode = undefined;
  });

  const envelope = () => JSON.parse(stdout.join(""));

  it.each([
    ["a leading CODE_X: in the message", new Error("SNAPSHOT_REPLAY_FAILED: the manifest is missing"), "SNAPSHOT_REPLAY_FAILED"],
    ["a code with digits", new Error("AUD_16_FUND: the miner stopped"), "AUD_16_FUND"],
    ["an explicit .code (it wins over the message)", Object.assign(new Error("OTHER_CODE: x"), { code: "REAL_CODE" }), "REAL_CODE"],
    ["no code at all", new Error("Something went wrong"), "UNKNOWN_ERROR"],
    ["a single word before a colon", new Error("Error: not a code"), "UNKNOWN_ERROR"],
    ["lowercase words", new Error("bad_input: no"), "UNKNOWN_ERROR"],
    ["a code that is not at the start", new Error("failed with SNAPSHOT_EXISTS: x"), "UNKNOWN_ERROR"]
  ])("handleError: %s", (_label, error, code) => {
    handleError(error);
    expect(envelope()).toMatchObject({ ok: false, code, message: error.message });
  });

  it("handleLockError takes the same code for an error that is not a lock error", () => {
    handleLockError(new Error("NODE_RESET_FAILED: docker is not running"));
    expect(envelope()).toMatchObject({ ok: false, code: "NODE_RESET_FAILED" });
  });
});
