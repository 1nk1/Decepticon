// Runs in the configured CLI service, using the same URL as its SDK client.
const timeout = Number(process.argv[1]);
const maxBytes = Number(process.argv[2]);
const timer = setTimeout(() => {
  console.error("CLI API request timed out");
  process.exit(1);
}, timeout);
(async () => {
  const base = (process.env.DECEPTICON_API_URL || "http://localhost:2024").replace(/\/$/, "");
  for (const path of ["/ok", "/assistants/search"]) {
    let response;
    try {
      response = await fetch(base + path, {
        method: path === "/ok" ? "GET" : "POST",
        redirect: "manual",
        ...(path === "/ok" ? {} : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph_id: "decepticon", limit: 1 }),
        }),
      });
    } catch (error) {
      // Do not print a configured URL, response body, or nested credential data.
      throw new Error(`${path} request failed (${error.cause?.code || error.name})`);
    }
    if (response.status !== 200) throw new Error(`${path} returned HTTP ${response.status}`);
    if (path === "/ok") {
      await response.body?.cancel();
      continue;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error(`assistant catalog exceeds ${maxBytes} bytes`);
      chunks.push(chunk);
    }
    process.stdout.write(Buffer.concat(chunks), () => {
      clearTimeout(timer);
      process.exit(0);
    });
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
