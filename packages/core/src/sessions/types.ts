export interface HardkasSession {
  readonly schema: "hardkas.session.v1";
  readonly name: string;
  readonly l1: {
    readonly wallet: string; // name in config/keystore
    readonly address?: string;
  };
  readonly l2: {
    readonly account: string; // name in config
    readonly address?: string;
  };
  readonly bridge: {
    readonly mode: "local-simulated" | "mainnet-multisig";
  };
  readonly createdAt: string;
}

export interface SessionStore {
  readonly activeSession?: string;
  readonly sessions: Record<string, HardkasSession>;
}
