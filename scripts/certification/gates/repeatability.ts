import { CertificationContext, CertificationGate, GateResult } from "../types.js";

/**
 * Repeatability needs a lab-specific definition of its stable artifacts. The
 * only one this gate had was the retired pre-v1 SilverScript escrow lab
 * (bl-002-b: source-built compiler, bridge-built unlocks), so it fails closed
 * until a lab defines its own. SilverScript repeatability is proven by
 * `hardkas corpus verify fixtures/toccata-v2/silver` (every artifact recompiled
 * byte-for-byte by the pinned silverc and checked against real-node evidence).
 */
export class RepeatabilityGate implements CertificationGate {
    name = "repeatability";

    async execute(ctx: CertificationContext): Promise<GateResult> {
        return {
            success: false,
            error: `REPEATABILITY_UNCONFIGURED: no stable-artifact definition for lab '${ctx.lab}'`
        };
    }
}
