import cors from "cors";
import express from "express";

import { startChainWatcher } from "./chainWatcher.js";
import { CORS_ORIGIN, PORT } from "./config.js";
import { relayRouter } from "./routes/relay.js";
import { relayState } from "./state.js";

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/snapshot", (_req, res) => {
  res.json(relayState.getSnapshot());
});

app.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(relayState.getSnapshot())}\n\n`);

  const unsubscribe = relayState.subscribe((snapshot) => {
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});

app.use("/relay", relayRouter);

app.listen(PORT, () => {
  console.log(`[relay] listening on http://localhost:${PORT}`);
  startChainWatcher();
});
