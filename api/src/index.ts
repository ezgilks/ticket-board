import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { closeRealtime, initRealtime } from "./realtime.js";
import { connectRedis, disconnectRedis } from "./redis.js";

// Express handles HTTP requests; Socket.io upgrades some connections to WebSockets.
// Both share one Node http server, and therefore one port.
async function main() {
  const redis = await connectRedis();
  console.log(redis ? "Redis connected" : "REDIS_URL not set — cache and socket adapter disabled");

  const server = createServer(createApp());
  const io = await initRealtime(server);

  server.listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT}`);
  });

  // Hosts (Render, ECS) send SIGTERM before stopping a container. Close cleanly so
  // in-flight requests finish and connections aren't left dangling.
  const shutdown = async () => {
    console.log("Shutting down…");
    await closeRealtime(io);
    await disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
