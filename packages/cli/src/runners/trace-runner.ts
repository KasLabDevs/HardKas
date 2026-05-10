import { 
  loadSimulatedTrace, 
  StoredSimulatedTxTrace 
} from "@hardkas/localnet";

export interface TraceRunnerInput {
  txId: string;
  cwd?: string;
}

export interface TraceRunnerResult {
  trace: StoredSimulatedTxTrace;
  formatted: string;
}

export async function runTrace(input: TraceRunnerInput): Promise<TraceRunnerResult> {
  const { txId, cwd } = input;
  
  const trace = await loadSimulatedTrace(txId, cwd ? { cwd } : undefined);
  
  const lines = [`Trace ${trace.txId}`, ""];
  
  for (const event of trace.events) {
    if (event.type === "phase.completed") {
      lines.push(`✓ ${event.phase}`);
    } else if (event.type === "tx.failed") {
      lines.push(`✗ ${event.phase}: ${event.reason}`);
    }
  }
  
  return {
    trace,
    formatted: lines.join("\n")
  };
}
