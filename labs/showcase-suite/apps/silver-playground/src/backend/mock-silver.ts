/**
 * SHOWCASE MOCK — not SilverScript.
 *
 * No compiler runs ("bytecode" is the source text, hex-encoded) and no script
 * executes (every simulation "succeeds"). Nothing produced here is evidence of
 * anything. Real SilverScript is `hardkas silver` / @hardkas/core
 * (managed silverc v1.0.0, Kaspa SDK, verified rusty-kaspad).
 */
export interface MockSilverBuild {
  source: string;
  bytecode: string;
  mock: true;
}

export interface MockSilverSimulation {
  success: boolean;
  executionTrace: string[];
  gasConsumed: number;
  mock: true;
}

const TEMPLATES = ["timelock-vault", "multisig-2-of-3"];

export class MockSilverToolkit {
  private constructor() {}

  static open(): MockSilverToolkit {
    return new MockSilverToolkit();
  }

  templates(): string[] {
    return [...TEMPLATES];
  }

  async build(source: string): Promise<MockSilverBuild> {
    return { source, bytecode: Buffer.from(source).toString("hex"), mock: true };
  }

  async simulate(_build: MockSilverBuild): Promise<MockSilverSimulation> {
    return { success: true, executionTrace: [], gasConsumed: 0, mock: true };
  }

  async artifact(build: MockSilverBuild, name?: string) {
    return { id: `mock-silver-${Date.now()}`, ...(name ? { name } : {}), source: build.source, bytecode: build.bytecode, mock: true as const };
  }

  /** A showcase log entry; deliberately not a HardKAS evidence schema. */
  async record(build: MockSilverBuild, simulation: MockSilverSimulation) {
    return { kind: "showcase.mock-silver.log", source: build.source, success: simulation.success, mock: true as const };
  }
}
