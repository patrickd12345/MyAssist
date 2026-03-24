import http from "node:http";

const proxyPort = Number(process.env.MYASSIST_TUNNEL_PROXY_PORT || 8787);
const allowedPath = "/webhook/myassist-daily-context";
const target = new URL(
  process.env.MYASSIST_N8N_WEBHOOK_TARGET ||
    "http://localhost:5678/webhook/myassist-daily-context",
);
const bearerToken = (process.env.MYASSIST_TUNNEL_BEARER_TOKEN || "").trim();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const incomingUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (incomingUrl.pathname !== allowedPath) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (bearerToken) {
    const auth = String(req.headers.authorization || "");
    if (auth !== `Bearer ${bearerToken}`) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
  }

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const body = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upstream request failed";
    sendJson(res, 502, { error: message });
  }
});

server.listen(proxyPort, "127.0.0.1", () => {
  process.stdout.write(
    `MyAssist tunnel proxy listening on http://127.0.0.1:${proxyPort}${allowedPath}\n`,
  );
});
