async function test() {
  const method = "getBlockTemplateRequest";
  const params = { payAddress: "simnet:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhx0cgpc", extraData: "" };
  try {
    const response = await fetch("http://127.0.0.1:18210", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params
      }),
    });
    console.log("Status:", response.status);
    console.log(await response.text());
  } catch (e) {
    console.error(e);
  }
}
test();
