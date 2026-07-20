import crypto from "node:crypto";

function canonicalStringify(obj: any): string {
    if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(',')}}`;
}

const payloadBytes = Buffer.alloc(10);
const integrityHash = crypto.createHash('sha256').update(payloadBytes).digest('hex');

const sessionIdHash = crypto.createHash("sha256").update(canonicalStringify({
    networkId: "simnet",
    planId: "plan-mock-1234",
    schemaVersion: 1,
    unsignedTransactionId: "plan-mock-1234"
})).digest("hex");

const initialSession: any = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    sessionId: sessionIdHash,
    revision: 0,
    planId: "plan-mock-1234",
    networkId: "simnet",
    unsignedTransactionId: "plan-mock-1234",
    state: "created",
    payload: {
        format: "pskt-binary-base64",
        encoding: "base64",
        data: "dGVzdA==",
        payloadHash: integrityHash,
        byteLength: payloadBytes.length
    },
    participants: [],
    requirements: [],
    attestations: [],
    runtimeBinding: {
        adapterId: "rust-pskt-native",
        adapterKind: "native",
        capabilitiesHash: "fake"
    },
    createdAt: new Date().toISOString()
};

const canonicalFields1 = {
    attestations: initialSession.attestations,
    kind: initialSession.kind,
    networkId: initialSession.networkId,
    parentRevisionHash: undefined,
    participants: initialSession.participants,
    payload: initialSession.payload,
    planId: initialSession.planId,
    requirements: initialSession.requirements,
    revision: initialSession.revision,
    runtimeBinding: initialSession.runtimeBinding,
    schemaVersion: initialSession.schemaVersion,
    sessionId: initialSession.sessionId,
    state: initialSession.state,
    unsignedTransactionId: initialSession.unsignedTransactionId
};

const hash1 = crypto.createHash("sha256").update(canonicalStringify(canonicalFields1)).digest("hex");

// Simulate writing to disk and reading back
const parsedSession = JSON.parse(JSON.stringify(initialSession));

const canonicalFields2 = {
    attestations: parsedSession.attestations,
    kind: parsedSession.kind,
    networkId: parsedSession.networkId,
    parentRevisionHash: parsedSession.parentRevisionHash,
    participants: parsedSession.participants,
    payload: parsedSession.payload,
    planId: parsedSession.planId,
    requirements: parsedSession.requirements,
    revision: parsedSession.revision,
    runtimeBinding: parsedSession.runtimeBinding,
    schemaVersion: parsedSession.schemaVersion,
    sessionId: parsedSession.sessionId,
    state: parsedSession.state,
    unsignedTransactionId: parsedSession.unsignedTransactionId
};

const hash2 = crypto.createHash("sha256").update(canonicalStringify(canonicalFields2)).digest("hex");

console.log("hash1:", hash1);
console.log("hash2:", hash2);
console.log("hash1 == hash2:", hash1 === hash2);
console.log("canonical1:", canonicalStringify(canonicalFields1));
console.log("canonical2:", canonicalStringify(canonicalFields2));
