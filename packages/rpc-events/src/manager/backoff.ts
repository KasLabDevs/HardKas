export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  maxAttempts?: number;
}

export class DeterministicBackoff {
  private attemptCount = 0;

  constructor(private config: BackoffConfig) {}

  public get attempt(): number {
    return this.attemptCount;
  }

  public nextDelay(): number | undefined {
    if (this.config.maxAttempts && this.attemptCount >= this.config.maxAttempts) {
      return undefined;
    }

    const delay = this.config.initialDelayMs * Math.pow(this.config.factor, this.attemptCount);
    this.attemptCount++;
    return Math.min(delay, this.config.maxDelayMs);
  }

  public reset(): void {
    this.attemptCount = 0;
  }
}
