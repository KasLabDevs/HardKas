import type { RpcTransport, RpcOptions } from "./transport.js";
import { RpcTimeoutError, RpcUnavailableError, RpcRateLimitError, RpcError, normalizeRpcError } from "../errors.js";

export interface JsonWrpcTransportOptions {
  url: string;
  fetcher?: typeof fetch;
}

/**
 * Implementación de transporte RPC sobre HTTP JSON (wRPC).
 * Solo soporta peticiones unitarias `send`. `subscribe` lanzará error.
 */
export class JsonWrpcTransport implements RpcTransport {
  public readonly url: string;
  private readonly fetcher: typeof fetch;

  constructor(options: JsonWrpcTransportOptions) {
    this.url = options.url;
    this.fetcher = options.fetcher || fetch;
  }

  async send<TRequest, TResponse>(
    method: string,
    request?: TRequest,
    options?: RpcOptions
  ): Promise<TResponse> {
    const controller = new AbortController();
    
    // Si el usuario provee un signal externo, enlazamos
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
      if (options.signal.aborted) {
        controller.abort();
      }
    }

    const timeoutMs = options?.timeoutMs || 10000;
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetcher(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params: request || {}
        }),
        signal: controller.signal
      });

      clearTimeout(id);

      if (response.status === 429) {
        throw new RpcRateLimitError();
      }

      if (!response.ok) {
        throw new RpcUnavailableError(`HTTP Error ${response.status}`, response.status);
      }

      const body = await response.json();
      if (body.error) {
        throw normalizeRpcError(new RpcError(body.error.message, body.error.code, body.error.data), { method, params: request });
      }

      return body.result as TResponse;
    } catch (e: unknown) {
      clearTimeout(id);
      if (e instanceof Error && ((e as any).name) === "AbortError") throw new RpcTimeoutError();
      throw normalizeRpcError(e, { method, params: request });
    }
  }

  subscribe<TNotification>(
    event: string,
    handler: (data: TNotification) => void
  ): void {
    throw new Error(`Subscribe no está soportado en transporte JSON HTTP. (Intento de suscripción a ${event})`);
  }

  unsubscribe<TNotification>(
    event: string,
    handler: (data: TNotification) => void
  ): void {
    // No-op en HTTP
  }

  async close(): Promise<void> {
    // No-op para HTTP
  }
}
