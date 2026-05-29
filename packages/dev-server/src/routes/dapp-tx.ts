import { Hono } from "hono";
import { Hardkas } from "@hardkas/sdk";
import { getQueryBackend } from "../db.js";

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
  } catch (e: any) {
    return c.json(
      {
        ok: false,
        error: {
          code: "HARDKAS_DEV_ERROR",
          message: "Failed to initialize HardKAS SDK: " + e.message
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
  } catch (e: any) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: e.message });
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
    return envelope(c, true, signed);
  } catch (e: any) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: e.message });
  }
});

dappTxRoutes.post("/send", async (c) => {
  const sdk = c.get("sdk");
  try {
    const body = await c.req.json();

    let planArtifact, signedArtifact, receiptArtifact;
    let artifacts = [];

    if (body.from && body.to && body.amountSompi) {
      if (!body.allowDevAutoSign) {
        return envelope(c, false, null, {
          code: "DEV_AUTOSIGN_NOT_ALLOWED",
          message:
            "Explicit allowDevAutoSign: true is required for dev-server auto-signing"
        });
      }
      if (sdk.network === "mainnet") {
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
      return envelope(c, false, null, {
        code: "BAD_REQUEST",
        message: "Missing signedTxId OR from/to/amountSompi with allowDevAutoSign"
      });
    }

    // 3. Simulate or Send
    let result;
    if (sdk.network === "simulated") {
      result = await sdk.tx.simulate(signedArtifact);
    } else {
      result = await sdk.tx.send(signedArtifact);
    }

    receiptArtifact = result.receipt;
    artifacts.push(receiptArtifact);

    const data = {
      plan: planArtifact,
      signed: signedArtifact,
      receipt: receiptArtifact,
      artifacts,
      warnings: [],
      explanation: { available: true, artifactId: receiptArtifact.txId }
    };

    return envelope(c, true, data);
  } catch (e: any) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: e.message });
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
  } catch (e: any) {
    return envelope(c, false, null, { code: "HARDKAS_DEV_ERROR", message: e.message });
  }
});
