import crypto from "node:crypto";
import { canonicalStringify } from "./packages/artifacts/src/index.ts";

function sha256(data: string | Buffer): string {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function computeSessionId(session: any): string {
    return sha256(canonicalStringify({
      networkId: session.networkId,
      planId: session.planId,
      schemaVersion: session.schemaVersion,
      unsignedTransactionId: session.unsignedTransactionId
    }));
}

const initialSession: any = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    sessionId: "1a8f984759c3bf3f02b5c27315de17da003c0d45f6fc4f6d9aa522b54a75bda6",
    revision: 0,
    planId: "plan-mock-1234",
    networkId: "simnet",
    unsignedTransactionId: "plan-mock-1234"
};

console.log("expected:", computeSessionId(initialSession));
