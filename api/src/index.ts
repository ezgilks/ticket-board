import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initRealtime } from "./realtime.js";

// Express handles HTTP requests; Socket.io upgrades some connections to WebSockets.
// Both share one Node http server, and therefore one port.
const server = createServer(createApp());
initRealtime(server);

server.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
