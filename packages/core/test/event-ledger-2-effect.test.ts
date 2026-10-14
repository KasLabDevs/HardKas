import { describe, it, expect } from "vitest";
import { createEventEnvelope, EventLedgerAppendError, rethrowWithLedgerEffect, type LedgerFailureEffect } from "../src/events.js";
import { HardkasError } from "../src/errors.js";
import { asArtifactId, asCorrelationId, asEventSequence, asNetworkId, asTxId, asWorkflowId } from "../src/domain-types.js";

// EVENT-LEDGER-2 · reviewer final closeout, decision A1 — the mechanism, unit level (new in this closeout, so it has no
// BEFORE of its own; the behaviour it replaces is pinned by the SDK and CLI event-ledger-2 tests): at an execution or
// broadcast boundary a ledger failure is rethrown with the same code, the same lost event and the same cause, naming
// what the step had already done; an effect named closer to the boundary is kept; any other error passes untouched.

const TX = "e".repeat(64);
const envelope = createEventEnvelope({
  kind: "workflow.submitted",
  domain: "workflow",
  workflowId: asWorkflowId("wf_el2_effect"),
  correlationId: asCorrelationId("wf_el2_effect"),
  networkId: asNetworkId("simnet"),
  payload: { txId: asTxId(TX), rpcUrl: "" },
  sequenceNumber: asEventSequence(1),
  globalOffset: 0,
  sourceSubsystem: "event-ledger-2-effect-test",
  txId: asTxId(TX),
  artifactId: asArtifactId("f".repeat(64))
});
const ledgerFailure = () => new EventLedgerAppendError("/ws/events.jsonl", envelope, new Error("no space left on device."));
const named = (effect: LedgerFailureEffect): EventLedgerAppendError => {
  try {
    rethrowWithLedgerEffect(ledgerFailure(), effect);
  } catch (e) {
    return e as EventLedgerAppendError;
  }
  throw new Error("rethrowWithLedgerEffect returned");
};

describe("EVENT-LEDGER-2 final closeout · rethrowWithLedgerEffect", () => {
  it("keeps the code, the lost event and the cause, and adds the effect (error field and metadata)", () => {
    const original = ledgerFailure();
    const effect: LedgerFailureEffect = { operation: "broadcast", outcome: "accepted", txId: TX, artifactId: "f".repeat(64), artifactPath: "/ws/s.json" };
    let thrown: any;
    try {
      rethrowWithLedgerEffect(original, effect);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EventLedgerAppendError);
    expect({ code: thrown.code, event: thrown.event, cause: thrown.cause, effect: thrown.effect, meta: thrown.metadata.effect }).toEqual({
      code: "EVENT_LEDGER_APPEND_FAILED",
      event: original.event,
      cause: original.cause,
      effect,
      meta: effect
    });
    expect(thrown.message).toContain("could not be recorded in /ws/events.jsonl: no space left on device.");
  });

  it("an effect already named closer to the boundary is kept; a non-ledger error passes untouched", () => {
    const inner = named({ operation: "broadcast", outcome: "unknown", txId: TX });
    expect(() => rethrowWithLedgerEffect(inner, { operation: "broadcast", outcome: "not-performed" })).toThrow(inner);
    const other = new HardkasError("SOMETHING_ELSE", "not a ledger failure");
    expect(() => rethrowWithLedgerEffect(other, { operation: "broadcast", outcome: "accepted" })).toThrow(other);
  });

  it("the message leads with the effect; a performed one never invites repeating the step", () => {
    const cases: Array<[LedgerFailureEffect, RegExp]> = [
      [{ operation: "broadcast", outcome: "accepted", txId: TX }, /^The node ACCEPTED the submission of transaction e{64} \(acceptance of the request by the RPC, not acceptance or confirmation in the DAG\): it WAS sent\./],
      [{ operation: "broadcast", outcome: "rejected", txId: TX }, /^The node REJECTED transaction e{64} with an explicit answer\./],
      [{ operation: "broadcast", outcome: "unknown", txId: TX }, /^The outcome of sending transaction e{64} is UNKNOWN: the submit call failed without an answer from the node, which may have received it\./],
      [{ operation: "simulated-execution", outcome: "executed", txId: TX }, /^The simulator EXECUTED transaction e{64}: the simulated state changed\./],
      [{ operation: "broadcast", outcome: "not-performed", txId: TX }, /^Nothing was sent: the ledger failed before transaction e{64} was broadcast\./],
      [{ operation: "simulated-execution", outcome: "not-performed" }, /^Nothing was executed: the ledger failed before the simulator ran the transaction\./]
    ];
    for (const [effect, lead] of cases) {
      const message = named(effect).message;
      expect(message, effect.outcome).toMatch(lead);
      if (effect.outcome === "not-performed") expect(message).toMatch(/then run the command again\.$/);
      else expect(message, "a performed effect: the step is never to be repeated").not.toMatch(/lost unless the step is repeated|run the command again/);
    }
  });
});
