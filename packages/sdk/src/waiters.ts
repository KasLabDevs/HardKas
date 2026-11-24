export class WaitError extends Error {
  constructor(message: string, public readonly code: string, public readonly lastObservedState?: any) {
    super(message);
    this.name = "WaitError";
  }
}

export interface WaitOptions {
  timeoutMs?: number | undefined;
  pollIntervalMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * A failure that waiting cannot change, so a poll ends with it at once (its own code) instead of retrying it until the
 * timeout hides it: a mainnet refusal (MAINNET TOTAL LOCKDOWN) and RPC-RESPONSE-TOO-LARGE-1 — the node's answer is
 * larger than HardKAS reads in one message (an address holding more than about 277,000 UTXOs); asking again gets the
 * same answer.
 */
export function isWaitDecisiveError(e: unknown): boolean {
  const code = String((e as { code?: unknown } | null | undefined)?.code ?? "");
  return /^MAINNET_(CONNECTION|SIGNING|BROADCAST)_DISABLED$/.test(code) || code === "RPC_RESPONSE_TOO_LARGE";
}

/** The code and text of a failure as a poll reports its last one ("[CODE] text"). */
export function describeWaitError(e: unknown): { code?: string; text: string } {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  const message = e instanceof Error ? e.message : String(e);
  return code !== undefined && code !== null && String(code) !== "" ? { code: String(code), text: `[${String(code)}] ${message}` } : { text: message };
}

/**
 * Deterministic polling primitive.
 * Evaluates the `condition` every `pollIntervalMs` until it returns a non-undefined result,
 * the `timeoutMs` expires, or `signal` aborts.
 */
export async function pollCondition<T>(
  condition: () => Promise<{ ok: boolean; value?: T; lastObservedState?: any }>,
  errorCode: string,
  errorMessage: string,
  options?: WaitOptions
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 60000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const deadline = Date.now() + timeoutMs;
  let lastObservedState: any;
  // RPC-RESPONSE-TOO-LARGE-1: the last failure a poll tolerated, named in the timeout (it was dropped silently)
  let lastError: { code?: string; text: string } | undefined;

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new WaitError("Wait aborted", "WAIT_ABORTED", lastObservedState);
    }

    try {
      const result = await condition();
      lastObservedState = result.lastObservedState;
      lastError = undefined;
      if (result.ok) {
        return result.value as T;
      }
    } catch (e: any) {
      // MAINNET TOTAL LOCKDOWN: a mainnet refusal is a decision, not a transient failure — never polled again (each
      // poll would otherwise be refused once more until the timeout hid the typed code). RPC-RESPONSE-TOO-LARGE-1: so
      // is an answer too large to read (isWaitDecisiveError).
      if (isWaitDecisiveError(e)) throw e;
      // Ignore network errors or transient RPC errors, keep polling.
      // E.g., node might be restarting in localnet context.
      lastError = describeWaitError(e);
      lastObservedState = { error: e?.message || String(e), ...(lastError.code ? { code: lastError.code } : {}) };
    }

    // Zero sleep outside of this wait
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new WaitError(lastError ? `${errorMessage} (last error: ${lastError.text})` : errorMessage, errorCode, lastObservedState);
}
