import { Hardkas } from "@hardkas/sdk";
import express from "express";

async function run() {
  const hardkas = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    logger: console
  });

  // Sync index to ensure we have the latest artifacts
  console.log("Syncing query store...");
  await hardkas.query.sync();

  const app = express();

  app.get("/artifacts", async (req, res) => {
    try {
      const list = await hardkas.artifacts.list();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/lineage/:id", async (req, res) => {
    try {
      const trace = await hardkas.lineage.trace(req.params.id);
      res.json(trace);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/verify/:id", async (req, res) => {
    try {
      const result = await hardkas.artifacts.verify(req.params.id);
      res.json({ id: req.params.id, verified: result.ok });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const server = app.listen(3000, () => {
    console.log("Audit server running on http://localhost:3000");
    console.log("Endpoints:");
    console.log(" - GET /artifacts");
    console.log(" - GET /lineage/:id");
    console.log(" - GET /verify/:id");

    // Shut down gracefully after 5 seconds since it's just a demo
    setTimeout(() => {
      console.log("Shutting down demo server...");
      server.close();
    }, 5000);
  });
}

run().catch(console.error);
