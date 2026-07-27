export interface CertificationContext {
    lab: string;
    projectRoot: string;
    manifest: any;
    result: any;
}

export interface GateResult {
    success: boolean;
    error?: string;
    data?: any;
}

export interface CertificationGate {
    name: string;
    execute(ctx: CertificationContext): Promise<GateResult>;
}
