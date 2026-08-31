import { createApp } from "./app.js";
import { startChainWatcher } from "./chainWatcher.js";
import { PORT } from "./config.js";

const app = createApp();

app.listen(PORT, () => {
  console.log(`[relay] listening on http://localhost:${PORT}`);
  startChainWatcher().catch((error: unknown) => {
    console.error("[relay] chain watcher failed to start:", error);
  });
});
