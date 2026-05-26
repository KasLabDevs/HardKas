// SAFETY_LEVEL: SIMULATION_ONLY

export class LcgPrng {
  private state: number;

  constructor(seed: number) {
    this.state = Math.abs(Math.trunc(seed)) % 2147483647;
    if (this.state === 0) this.state = 1;
  }

  /** Returns a float between 0 (inclusive) and 1 (exclusive) */
  next(): number {
    // MINSTD parameters
    this.state = (this.state * 48271) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  /** Returns an integer between min (inclusive) and max (inclusive) */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    const idx = this.nextInt(0, arr.length - 1);
    return arr[idx]!;
  }

  /** Deterministic shuffle */
  shuffle<T>(arr: T[]): T[] {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = res[i]!;
      res[i] = res[j]!;
      res[j] = tmp;
    }
    return res;
  }
}

export type TortureCaseResult = {
  caseId: string;
  seed: number;
  bucket: string;
  flow: string;
  mutation: string;
  expectedInvariant: string;
  status: "pass" | "fail";
  failureReason?: string;
  failureCode?: string;
  severity?: "info" | "warning" | "critical" | "catastrophic";
  reproduceCommand: string;
  artifactsBefore?: string[];
  artifactsAfter?: string[];
  environmentMode?: string;
  filesystemMode?: string;
  symlinkMode?: string;
  normalizedPathStrategy?: string;
  clockSkewDetected?: boolean;
  externalMutationDetected?: boolean;
  longPathSupportDetected?: boolean;
  sandboxSnapshotPath?: string;
};

export interface TortureBucketContext {
  globalSeed: number;
  caseSeed: number;
  caseId: string;
  prng: LcgPrng;
  workspaceDir: string;
}

export type TortureBucketRunner = (ctx: TortureBucketContext) => Promise<{
  flow: string;
  mutation: string;
  expectedInvariant?: string;
  artifactsBefore?: string[];
  artifactsAfter?: string[];
  environmentMode?: string;
  filesystemMode?: string;
  symlinkMode?: string;
  normalizedPathStrategy?: string;
  clockSkewDetected?: boolean;
  externalMutationDetected?: boolean;
  longPathSupportDetected?: boolean;
}>;

export interface TortureBucket {
  name: string;
  expectedInvariant: string;
  run: TortureBucketRunner;
}

const bucketsMap = new Map<string, TortureBucket>();

export function registerTortureBucket(bucket: TortureBucket) {
  bucketsMap.set(bucket.name, bucket);
}

export function getTortureBucket(name: string): TortureBucket | undefined {
  return bucketsMap.get(name);
}

export function getAllTortureBuckets(): TortureBucket[] {
  return Array.from(bucketsMap.values());
}

export class TortureInvariantError extends Error {
  public code: string;
  public severity: "info" | "warning" | "critical" | "catastrophic";
  
  constructor(message: string, code: string, severity: "info" | "warning" | "critical" | "catastrophic" = "critical") {
    super(message);
    this.name = "TortureInvariantError";
    this.code = code;
    this.severity = severity;
  }
}

