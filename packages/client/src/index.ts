export interface HardKASResponseSuccess<T> {
  ok: true;
  data: T;
}

export interface HardKASResponseError {
  ok: false;
  code: string;
  message: string;
  details?: any;
}

export type HardKASResponse<T> = HardKASResponseSuccess<T> | HardKASResponseError;

export interface HardKASClientConfig {
  baseUrl?: string;
  timeout?: number;
}

export class HardKASClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config?: HardKASClientConfig) {
    this.baseUrl = config?.baseUrl || "http://127.0.0.1:3000";
    this.timeout = config?.timeout || 10000;
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<HardKASResponse<T>> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers
        }
      });

      const data = await response.json();
      return data as HardKASResponse<T>;
    } catch (error: any) {
      if (error.name === "AbortError") {
        return {
          ok: false,
          code: "TIMEOUT_ERROR",
          message: `Request to ${path} timed out after ${this.timeout}ms.`
        };
      }
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: error.message || "Unknown network error"
      };
    }
  }

  // --- API Endpoints ---

  async getWallet(address: string): Promise<HardKASResponse<any>> {
    return this.request(`/api/wallet/${address}`);
  }

  async txPlan(payload: any): Promise<HardKASResponse<any>> {
    return this.request("/api/tx/plan", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async txSimulate(payload: any): Promise<HardKASResponse<any>> {
    return this.request("/api/tx/simulate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async txSign(payload: any): Promise<HardKASResponse<any>> {
    return this.request("/api/tx/sign", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async txSend(payload: any): Promise<HardKASResponse<any>> {
    return this.request("/api/tx/send", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
}

export function createClient(config?: HardKASClientConfig) {
  return new HardKASClient(config);
}
