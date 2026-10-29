// Swiggy Builders Club OAuth Bridge
// Swiggy's OAuth validation strictly whitelists http://localhost:8000/auth/callback for local development.
// This bridge listens on port 8000 (HTTP) and seamlessly redirects incoming authorization callbacks
// to the active Vite app on https://localhost:8080/app/shopping.

import http from "node:http";

let bridgeServer: http.Server | null = null;
let isBridgeRunning = false;

export function startSwiggyOAuthBridge(targetOrigin = "https://localhost:8080") {
  if (isBridgeRunning || bridgeServer) return;

  try {
    bridgeServer = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "/", "http://localhost:8000");

        if (reqUrl.pathname === "/auth/callback") {
          const code = reqUrl.searchParams.get("code") || "";
          const state = reqUrl.searchParams.get("state") || "";
          const error = reqUrl.searchParams.get("error") || "";
          const errorDesc = reqUrl.searchParams.get("error_description") || "";

          const redirectUrl = new URL(`${targetOrigin}/app/shopping`);
          if (code) redirectUrl.searchParams.set("code", code);
          if (state) redirectUrl.searchParams.set("state", state);
          if (error) redirectUrl.searchParams.set("error", error);
          if (errorDesc) redirectUrl.searchParams.set("error_description", errorDesc);

          console.log(`[Swiggy Bridge] Received OAuth callback. Forwarding to ${redirectUrl.toString()}`);

          res.writeHead(302, {
            Location: redirectUrl.toString(),
            "Access-Control-Allow-Origin": "*"
          });
          res.end(`Redirecting to AI Smart Pantry...`);
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      } catch (err) {
        console.error("[Swiggy Bridge] Error handling request:", err);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    });

    bridgeServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.warn("[Swiggy Bridge] Port 8000 already in use; bridge server skipped.");
      } else {
        console.error("[Swiggy Bridge] Server error:", err);
      }
      isBridgeRunning = false;
    });

    bridgeServer.listen(8000, "127.0.0.1", () => {
      isBridgeRunning = true;
      console.log("[Swiggy Bridge] Pre-whitelisted HTTP OAuth Bridge listening at http://localhost:8000/auth/callback");
    });
  } catch (err) {
    console.warn("[Swiggy Bridge] Failed to initialize OAuth bridge:", err);
  }
}

