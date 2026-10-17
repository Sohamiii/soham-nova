
const { app, shell } = require("electron");
const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = 3210;

// Replace with your GitHub Pages origin.
// Example: https://yourusername.github.io
const ALLOWED_ORIGIN =
  process.env.NOVA_ALLOWED_ORIGIN || "https://YOUR-USERNAME.github.io";

function send(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function validWebUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      Boolean(u.hostname) &&
      value.length <= 2000;
  } catch {
    return false;
  }
}

app.whenReady().then(() => {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";

    // Only allow your published dashboard and local development.
    const allowed =
      origin === ALLOWED_ORIGIN ||
      origin === "http://localhost:5500" ||
      origin === "http://127.0.0.1:5500";

    if (!allowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "Origin not allowed" }));
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin"
      });
      return res.end();
    }

    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, service: "NOVA companion" }, origin);
    }

    if (req.method !== "POST" || req.url !== "/command") {
      return send(res, 404, { ok: false, error: "Not found" }, origin);
    }

    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8192) req.destroy();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const action = data.action;
        let target;

        if (action === "openUrl") {
          if (typeof data.value !== "string" ||
              !validWebUrl(data.value)) {
            return send(res, 400, { ok: false, error: "Invalid URL" }, origin);
          }
          target = data.value;
        } else if (action === "search") {
          if (typeof data.value !== "string" ||
              !data.value.trim() || data.value.length > 500) {
            return send(res, 400, { ok: false, error: "Invalid query" }, origin);
          }
          target = "https://www.google.com/search?q=" +
            encodeURIComponent(data.value.trim());
        } else if (action === "youtube") {
          if (typeof data.value !== "string" ||
              !data.value.trim() || data.value.length > 500) {
            return send(res, 400, { ok: false, error: "Invalid query" }, origin);
          }
          target = "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(data.value.trim());
        } else {
          return send(res, 400, { ok: false, error: "Action not allowed" }, origin);
        }

        await shell.openExternal(target);
        return send(res, 200, { ok: true }, origin);
      } catch {
        return send(res, 400, { ok: false, error: "Invalid request" }, origin);
      }
    });
  });

  server.on("error", error => {
    console.error("NOVA companion server error:", error.message);
  });

  server.listen(PORT, HOST, () => {
    console.log(`NOVA companion listening at http://${HOST}:${PORT}`);
    console.log("Keep this window open while using desktop actions.");
  });

  app.on("before-quit", () => server.close());
});

app.on("window-all-closed", () => {
  // Keep the local companion running until you quit the app.
});
