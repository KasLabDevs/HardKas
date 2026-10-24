import { Hono } from "hono";
import { Hardkas } from "@hardkas/sdk";
import { getQueryBackend } from "../db.js";
import { submitOutcomeOf } from "@hardkas/artifacts";
import { sendGuardFor, idempotencyKeyOf, NOT_SENT_CODES } from "./send-guard.js";

type DevEnv = { Variables: { sdk: Hardkas } };
export const dappTxRoutes = new Hono<DevEnv>();

// Helper to create the standard stable JSON envelope
function envelope(c: any, ok: boolean, data?: any, error?: any) {
  const sdk = c.get("sdk");
  return c.json(
    {
      ok,
      data,
      error,
      warnings: [],
      meta: {
        workspace: sdk?.cwd || process.cwd(),
        network: sdk?.network || "simulated",
        mode: sdk?.mode || "developer"
      }
    },
    ok ? 200 : error?.code === "BAD_REQUEST" ? 400 : 500
  );
}

// Middleware to inject SDK instance
dappTxRoutes.use("*", async (c, next) => {
  try {
    const sdk = await Hardkas.create({ cwd: process.env.HARDKAS_ROOT || process.cwd() });
    c.set("sdk", sdk);
    await next();
  } catch (e: unknown) {
    return c.json(
      {
        ok: false,
        error: {
          code: "HARDKAS_DEV_ERROR",
          message: "Failed to initialize HardKAS SDK: " + ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))
        }
      },
      500
    );
  }
});

dappTxRoutes.post("/plan", async (c) => {
  const sdk = c.get("sdk");
  try {
    const body = await c.req.json();
    if (!body.from || !body.to || !body.amountSompi) {
      return envelope(c, false, null, {
        code: "BAD_REQUEST",
        message: "Missing from, to, or amountSompi"
      });
    }

    const plan = await sdk.tx.plan({
      from: body.from,
      to: body.to,
      amount: body.amountSompi,
      ...(body.feeRate ? { feeRate: BigInt(body.feeRate) } : {})
    });

    return envelope(c, true, plan);
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }
});

dappTxRoutes.post("/sign", async (c) => {
  const sdk = c.get("sdk");
  try {
    const body = await c.req.json();
    if (!body.planId && !body.plan) {
      return envelope(c, false, null, {
        code: "BAD_REQUEST",
        message: "Missing planId or plan artifact"
      });
    }

    if (sdk.network === "mainnet") {
      return envelope(c, false, null, {
        code: "HTTP_SIGNING_NOT_ALLOWED",
        message:
          "Signing transactions on mainnet via HTTP Dev Server is strictly prohibited for security reasons."
      });
    }

    let planArtifact = body.plan;
    if (body.planId && !planArtifact) {
      // Find the plan in artifacts
      const artifacts = await getQueryBackend().findArtifacts();
      planArtifact = artifacts.find(
        (a) => a.artifactId === body.planId || a.payload?.id === body.planId
      )?.payload;
      if (!planArtifact) throw new Error("Plan not found");
    }

    const signed = await sdk.tx.sign(planArtifact, body.account);
    const response = envelope(c, true, signed);
    // Note: The envelope doesn't directly expose adding warnings dynamically after creation,
    // but the meta property indicates it's simulated/developer mode.
    return response;
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }
});

dappTxRoutes.post("/send", async (c) => {
  const sdk = c.get("sdk");
  let body: any;
  try {
    body = await c.req.json();
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }

  // P0-TX-SAFETY-1A: decided before anything is planned, signed or sent (send-guard.ts), per workspace
  const network = String(sdk.network);
  const broadcasts = network !== "simulated";
  const guard = sendGuardFor(sdk.cwd || process.env.HARDKAS_ROOT || process.cwd());
  const admission = guard.admit(body, network, broadcasts);
  if (admission.kind === "replay") {
    return c.json(admission.answer.body as any, admission.answer.status as any);
  }
  if (admission.kind === "refuse") {
    return envelope(c, false, null, {
      code: admission.code,
      message: admission.message,
      ...(admission.txId ? { txId: admission.txId } : {})
    });
  }

  let planArtifact, signedArtifact, receiptArtifact;
  let artifacts = [];
  let broadcastStarted = false;
  const begun = guard.begin(body, network, broadcasts);
  if (!begun.ok) {
    const r = begun.refusal as { code: string; message: string };
    return envelope(c, false, null, { code: r.code, message: r.message });
  }
  const pending = begun.pending;
  try {
    if (body.from && body.to && body.amountSompi) {
      if (!body.allowDevAutoSign) {
        guard.abandon(pending);
        return envelope(c, false, null, {
          code: "DEV_AUTOSIGN_NOT_ALLOWED",
          message:
            "Explicit allowDevAutoSign: true is required for dev-server auto-signing"
        });
      }
      if (sdk.network === "mainnet") {
        guard.abandon(pending);
        return envelope(c, false, null, {
          code: "DEV_AUTOSIGN_NOT_ALLOWED",
          message: "Auto-signing on mainnet is strictly prohibited"
        });
      }

      // 1. Plan
      planArtifact = await sdk.tx.plan({
        from: body.from,
        to: body.to,
        amount: body.amountSompi,
        ...(body.feeRate ? { feeRate: BigInt(body.feeRate) } : {})
      });
      artifacts.push(planArtifact);

      // 2. Sign
      signedArtifact = await sdk.tx.sign(planArtifact, body.from);
      artifacts.push(signedArtifact);
    } else if (body.signedTxId || body.signedTx) {
      signedArtifact = body.signedTx;
      if (body.signedTxId && !signedArtifact) {
        const queryBackend = await getQueryBackend().findArtifacts();
        signedArtifact = queryBackend.find(
          (a) =>
            a.artifactId === body.signedTxId || a.payload?.signedId === body.signedTxId
        )?.payload;
        if (!signedArtifact) throw new Error("Signed transaction not found");
      }
    } else {
      guard.abandon(pending);
      return envelope(c, false, null, {
        code: "BAD_REQUEST",
        message: "Missing signedTxId OR from/to/amountSompi with allowDevAutoSign"
      });
    }

    // 3. Simulate or Send
    let result;
    const simulated = !broadcasts;
    // P0-TX-SAFETY-1A: the txId is on record BEFORE the broadcast; if it cannot be recorded, nothing is broadcast
    const sendingTxId = typeof (signedArtifact as any)?.txId === "string" ? (signedArtifact as any).txId : undefined;
    if (!simulated && !guard.signed(pending, sendingTxId ?? "unknown")) {
      guard.abandon(pending);
      return envelope(c, false, null, {
        code: "SEND_GUARD_UNAVAILABLE",
        message: "The send could not be recorded before the broadcast; nothing was sent. Sends stay refused until the send-guard log is repaired."
      });
    }
    broadcastStarted = !simulated;
    if (simulated) {
      result = await sdk.tx.simulate(signedArtifact);
    } else {
      result = await sdk.tx.send(signedArtifact);
    }

    receiptArtifact = result.receipt;
    artifacts.push(receiptArtifact);

    // P0-TX-SAFETY-1A: what the submit call's recorded result establishes (accepted / rejected / unknown), never a
    // consensus state. An unknown outcome is said so: the node may have the transaction, so it is not a failure to retry.
    const outcome = simulated ? "executed" : submitOutcomeOf((receiptArtifact as any)?.submitResult);
    const txId = (receiptArtifact as any)?.txId ?? (signedArtifact as any)?.txId;
    const warnings =
      outcome === "unknown"
        ? [
            `The submit call for transaction ${txId} got no answer: the node may have it. Do not pay again; observe it ` +
              "(GET /api/tx/receipt/<txId>, `hardkas tx wait <txId>`)."
          ]
        : [];

    const data = {
      plan: planArtifact,
      signed: signedArtifact,
      receipt: receiptArtifact,
      artifacts,
      outcome,
      ...(idempotencyKeyOf(body) ? { idempotencyKey: idempotencyKeyOf(body) } : {}),
      warnings,
      explanation: { available: true, artifactId: receiptArtifact.txId }
    };

    const response = envelope(c, true, data);
    guard.finish(pending, outcome as any, typeof txId === "string" ? txId : undefined, { status: response.status, body: await response.clone().json() });
    return response;
  } catch (e: unknown) {
    const message = (e instanceof Error) ? e.message : String(e);
    const code = typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : undefined;
    // P0-TX-SAFETY-1A: a failure once the broadcast may have started is an unknown outcome unless the error itself says
    // nothing was sent; it is recorded so that the same payment is not planned and signed again.
    if (broadcastStarted && !(code !== undefined && NOT_SENT_CODES.has(code))) {
      const txId = typeof (signedArtifact as any)?.txId === "string" ? (signedArtifact as any).txId : undefined;
      const response = envelope(c, false, null, {
        code: "TX_SEND_OUTCOME_UNKNOWN",
        message:
          `The send of transaction ${txId ?? "(unknown txId)"} failed after the broadcast may have started (${message}): ` +
          "the node may have it. Do not pay again; observe it (GET /api/tx/receipt/<txId>, `hardkas tx wait <txId>`).",
        ...(txId ? { txId } : {}),
        ...(idempotencyKeyOf(body) ? { idempotencyKey: idempotencyKeyOf(body) } : {})
      });
      guard.finish(pending, "unknown", txId, { status: response.status, body: await response.clone().json() });
      return response;
    }
    guard.abandon(pending);
    return envelope(c, false, null, { code: code && NOT_SENT_CODES.has(code) ? code : "HARDKAS_DEV_ERROR", message });
  }
});

dappTxRoutes.get("/receipt/:id", async (c) => {
  const sdk = c.get("sdk");
  try {
    const id = c.req.param("id");
    const artifacts = await getQueryBackend().findArtifacts({ schema: "TxReceipt.v1" });
    const receipt = artifacts.find(
      (a) => a.artifactId === id || a.payload?.txId === id
    )?.payload;

    if (!receipt) {
      return envelope(c, false, null, {
        code: "NOT_FOUND",
        message: "Receipt not found"
      });
    }

    return envelope(c, true, receipt);
  } catch (e: unknown) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) });
  }
});
