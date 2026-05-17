import { describe, it, expect } from "vitest";
import { 
  HashInvariant, 
  SchemaInvariant, 
  BasicCorrelationInvariant, 
  BasicLineageInvariant,
  InvariantWatcher
} from "../src/index.js";
import { createEventEnvelope, asWorkflowId, asCorrelationId, asNetworkId } from "@hardkas/core";

describe("Invariant System (Phase 5)", () => {
  it("HashInvariant should detect mismatch", async () => {
    const invar = new HashInvariant();
    const artifact = {
      artifactId: "art-1",
      contentHash: "wrong-hash",
      payload: "hello"
    };

    const violations = await invar.check({ artifact: artifact as any });
    expect(violations.length).toBe(1);
    expect(violations[0]!.code).toBe("INVAR_HASH_MATCH");
  });

  it("SchemaInvariant should detect unsupported schema", async () => {
    const invar = new SchemaInvariant();
    const artifact = {
      schema: "hardkas.unknown.v99",
      version: "1.0.0"
    };

    const violations = await invar.check({ artifact: artifact as any });
    expect(violations.length).toBe(1);
    expect(violations[0]!.code).toBe("INVAR_SCHEMA_SUPPORT");
  });

  it("BasicCorrelationInvariant should detect missing IDs", async () => {
    const invar = new BasicCorrelationInvariant();
    const event = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: "" as any, // Missing
      correlationId: "" as any,
      networkId: asNetworkId("simnet"),
      payload: { workflowId: "" as any, network: asNetworkId("simnet") }
    });

    const violations = await invar.check({ event });
    expect(violations.length).toBe(2);
  });

  it("InvariantWatcher should emit integrity.violation and stop correctly", async () => {
    const emitted: any[] = [];
    const eventBus = {
      subscribe: (cb: any) => {
        const handler = cb;
        return () => {}; // Mock unsubscribe
      },
      emit: (ev: any) => { emitted.push(ev); }
    };

    // We'll manually trigger the callback for the test
    let registeredCb: any;
    eventBus.subscribe = (cb: any) => {
      registeredCb = cb;
      return () => { registeredCb = null; };
    };

    const watcher = new InvariantWatcher({
      invariants: [new HashInvariant()],
      eventBus
    });

    watcher.start();
    
    // Trigger an event that violates HashInvariant
    const sourceEvent = createEventEnvelope({
      kind: "workflow.plan.created",
      domain: "workflow",
      workflowId: asWorkflowId("wf-1"),
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("simnet"),
      payload: { 
        planId: "art-1" as any,
        network: asNetworkId("simnet"),
        amountSompi: 100n
      }
    });

    // Manually pass an artifact in context via a custom check logic if we want to test the full flow
    // In the real watcher, it uses event.payload or similar.
    // Let's mock a simpler invariant for the watcher test.
    
    const mockInvar = {
      id: "MOCK_FAIL",
      description: "Always fails",
      check: async () => [{ code: "MOCK_FAIL", severity: "error" as const, message: "Fail" }]
    };

    const watcher2 = new InvariantWatcher({
      invariants: [mockInvar],
      eventBus
    });
    watcher2.start();

    await registeredCb(sourceEvent);

    expect(emitted.length).toBe(1);
    expect(emitted[0].domain).toBe("integrity");
    expect(emitted[0].kind).toBe("integrity.violation");
    expect(emitted[0].workflowId).toBe("wf-1");

    watcher2.stop();
    expect(registeredCb).toBeNull();
  });

  it("InvariantWatcher should not loop on integrity events", async () => {
    const emitted: any[] = [];
    const eventBus = {
      subscribe: (cb: any) => {
        return () => {};
      },
      emit: (ev: any) => { emitted.push(ev); }
    };

    let registeredCb: any;
    eventBus.subscribe = (cb: any) => { registeredCb = cb; return () => {}; };

    const watcher = new InvariantWatcher({
      invariants: [{ id: "FAIL", description: "F", check: async () => [{ code: "F", severity: "error", message: "F" }] }],
      eventBus
    });
    watcher.start();

    const integrityEvent = createEventEnvelope({
      kind: "integrity.violation",
      domain: "integrity",
      workflowId: asWorkflowId("wf-1"),
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("simnet"),
      payload: { violationCode: "TEST", severity: "error", message: "skip" }
    });

    await registeredCb(integrityEvent);

    // Should NOT emit anything because it skips "integrity" domain
    expect(emitted.length).toBe(0);
  });
});
