import cors from "cors";
import express from "express";

import { CORS_ORIGIN } from "./config.js";
import { errorHandler, notFoundHandler } from "./errorHandler.js";
import { relayRouter } from "./routes/relay.js";
import { relayState } from "./state.js";

/** Comment frames sent to idle SSE clients so proxies don't reap the connection. */
const SSE_HEARTBEAT_MS = 15_000;

/** Builds the HTTP surface. Kept separate from index.ts so tests can mount it without listening. */
export function createApp() {
  const app = express();

  app.use(cors({ origin: CORS_ORIGIN }));
  // Every accepted action is a handful of short strings; anything larger is abuse, and the relay
  // pays gas proportional to what it forwards.
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/snapshot", (_req, res) => {
    res.json(relayState.getSnapshot());
  });

  app.get("/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Railway's edge (like most nginx setups) buffers proxied responses by default, holding
      // events back until the buffer fills — the big screen would sit on a stale snapshot.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // How long EventSource should wait before reconnecting after a drop.
    res.write("retry: 3000\n\n");
    res.write(`data: ${JSON.stringify(relayState.getSnapshot())}\n\n`);

    const unsubscribe = relayState.subscribe((snapshot) => {
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    // During a lull there may be no events for minutes. Without a heartbeat the proxy closes the
    // connection and the screen keeps showing "● en vivo" over frozen data.
    const heartbeat = setInterval(() => {
      res.write(": keepalive\n\n");
    }, SSE_HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    res.on("error", cleanup);
  });

  app.use("/relay", relayRouter);

  // Order matters: unknown-path 404 first, then the terminal error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
