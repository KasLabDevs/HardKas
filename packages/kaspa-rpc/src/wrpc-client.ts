// SAFETY_LEVEL: SIMULATION_ONLY
//
// Kaspa wRPC client for JSON wRPC over WebSocket.
// Connects to rusty-kaspad port 18210 (simnet) / 18110 (mainnet).
//
// IMPORTANT: The wRPC JSON envelope format has been verified against
// rusty-kaspad v1.1.0. If the format changes, this client must be updated.

import WebSocket from "ws";

export interface WrpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface WrpcResponse {
  id?: number;
  result?: unknown;
  params?: unknown;
  error?: { message: string; code?: number };
}

export class KaspaWrpcClient {
  private url: string;
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: WrpcResponse) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  public onNotification?: (msg: WrpcResponse) => void;
  public debug = false;

  constructor(url: string) {
    // Normalize URL to ws:// or wss://
    if (url.startsWith("http://")) {
      this.url = url.replace("http://", "ws://");
    } else if (url.startsWith("https://")) {
      this.url = url.replace("https://", "wss://");
    } else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      this.url = `ws://${url}`;
    } else {
      this.url = url;
    }
  }

  getUrl(): string {
    return this.url;
  }

  async connect(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.disconnect();
        reject(
          new Error(`WebSocket connection timeout after ${timeoutMs}ms to ${this.url}`)
        );
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`Failed to create WebSocket to ${this.url}: ${err}`));
        return;
      }

      this.ws.on("open", () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      this.ws.on("message", (data) => {
        try {
          const response: WrpcResponse = JSON.parse(data.toString());
          if (response.id !== undefined) {
            const pending = this.pending.get(response.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(response.id);
              pending.resolve(response);
            }
          } else {
            // Notification or non-correlated message from server
            if (this.onNotification) {
              this.onNotification(response);
            }
          }
        } catch (parseErr) {
          // Non-JSON message — log in debug mode
          if (this.debug) {
            console.debug(
              "[wRPC] Non-JSON message received:",
              data.toString().slice(0, 200)
            );
          }
        }
      });

      this.ws.on("close", () => {
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  async request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 5000
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected. Call connect() first.");
    }

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`wRPC timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (response) => {
          if (response.error) {
            const errMsg =
              response.error.message ||
              `wRPC error code ${response.error.code || "unknown"}`;
            reject(new Error(errMsg));
          } else {
            resolve(response.result !== undefined ? response.result : response.params);
          }
        },
        reject,
        timer
      });

      // Envelope format verified against rusty-kaspad v1.1.0
      this.ws!.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  async getServerInfo(): Promise<unknown> {
    return this.request("getServerInfo");
  }
  async getBlockDagInfo(): Promise<unknown> {
    return this.request("getBlockDagInfo");
  }
  async getVirtualSelectedParentBlueScore(): Promise<unknown> {
    return this.request("getVirtualSelectedParentBlueScore");
  }
  async getUtxosByAddresses(addresses: string[]): Promise<unknown> {
    return this.request("getUtxosByAddresses", { addresses });
  }

  async ping(): Promise<boolean> {
    try {
      await this.getServerInfo();
      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
  }
}
