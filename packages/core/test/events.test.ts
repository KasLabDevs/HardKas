import { describe, it, expect, vi } from "vitest";
import { 
  createEventEnvelope, 
  validateEventEnvelope, 
  coreEvents 
} from "../src/events.js";
import { 
  asWorkflowId, 
  asCorrelationId, 
  asNetworkId, 
  asArtifactId,
  asEventId
} from "../src/domain-types.js";

describe("Event Envelope (Phase 2)", () => {
  const mockWorkflowId = asWorkflowId("wf-123");
  const mockCorrelationId = asCorrelationId("corr-456");
  const mockNetworkId = asNetworkId("testnet-10");

  it("createEventEnvelope should populate all required fields", () => {
    const envelope = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId, network: mockNetworkId }
    });

    expect(envelope.schema).toBe("hardkas.event");
    expect(envelope.version).toBe("1.0.0");
    expect(envelope.eventId).toBeDefined();
    expect(envelope.domain).toBe("workflow");
    expect(envelope.kind).toBe("workflow.started");
    expect(envelope.timestamp).toBeDefined();
    expect(envelope.workflowId).toBe(mockWorkflowId);
    expect(envelope.correlationId).toBe(mockCorrelationId);
    expect(envelope.networkId).toBe(mockNetworkId);
    expect(envelope.payload.workflowId).toBe(mockWorkflowId);
  });

  it("should support causationId for linking events", () => {
    const eventId1 = asEventId("evt-1");
    const envelope2 = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId },
      causationId: eventId1
    });

    expect(envelope2.causationId).toBe(eventId1);
  });

  it("validateEventEnvelope should perform lightweight checks", () => {
    const validEnvelope = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId }
    });

    expect(validateEventEnvelope(validEnvelope)).toBe(true);
    expect(validateEventEnvelope({})).toBe(false);
    expect(validateEventEnvelope({ schema: "hardkas.event" })).toBe(false);
  });

  it("JSON.stringify should produce expected envelope shape", () => {
    const envelope = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId }
    });

    const json = JSON.stringify(envelope);
    const parsed = JSON.parse(json);

    expect(parsed.schema).toBe("hardkas.event");
    expect(parsed.kind).toBe("workflow.completed");
    expect(typeof parsed.eventId).toBe("string"); // Branded IDs serialize as strings
  });

  it("CoreEventBus should emit and listen for EventEnvelope", () => {
    const listener = vi.fn();
    coreEvents.on(listener);

    const envelope = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId }
    });

    coreEvents.emit(envelope);

    expect(listener).toHaveBeenCalledWith(envelope);
  });

  it("timestamp should not be used for causal ordering in tests (documented behavior)", () => {
    // This test is mostly documentation of the principle.
    // Causality is derived from IDs, not timestamps which can be imprecise.
    const e1 = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId, network: mockNetworkId }
    });

    const e2 = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: mockWorkflowId,
      correlationId: mockCorrelationId,
      networkId: mockNetworkId,
      payload: { workflowId: mockWorkflowId },
      causationId: e1.eventId
    });

    expect(e2.causationId).toBe(e1.eventId);
    // Even if timestamps were identical (very fast execution), causality is clear.
  });
});
