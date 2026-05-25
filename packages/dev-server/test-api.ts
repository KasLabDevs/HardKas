import { accountsRoutes } from "./src/routes/accounts.js";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/accounts", accountsRoutes);

async function test() {
  const req = new Request("http://localhost/api/accounts");
  const res = await app.fetch(req);
  const data = await res.json();
  console.log("RESPONSE:", JSON.stringify(data, null, 2));
}
test().catch(console.error);
