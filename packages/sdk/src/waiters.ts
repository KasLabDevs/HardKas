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

  while (Date.now() < deadline) {
    if (options?.signal?.aborted) {
      throw new WaitError("Wait aborted", "WAIT_ABORTED", lastObservedState);
    }

    try {
      const result = await condition();
      lastObservedState = result.lastObservedState;
      if (result.ok) {
        return result.value as T;
      }
    } catch (e: any) {
      // Ignore network errors or transient RPC errors, keep polling.
      // E.g., node might be restarting in localnet context.
      lastObservedState = { error: e.message || String(e) };
    }

    // Zero sleep outside of this wait
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new WaitError(errorMessage, errorCode, lastObservedState);
}
