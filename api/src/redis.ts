import { createClient } from "redis";
import { config } from "./config.js";

export type RedisClient = ReturnType<typeof createClient>;

// One shared client for caching. Null when REDIS_URL isn't set: the app still
// works, it just skips caching and can only run as a single instance.
let client: RedisClient | null = null;

export async function connectRedis(): Promise<RedisClient | null> {
  if (!config.REDIS_URL) return null;
  if (client) return client;
  client = createClient({ url: config.REDIS_URL });
  client.on("error", (err) => console.error("[redis]", err.message));
  await client.connect();
  return client;
}

export function getRedis() {
  return client?.isReady ? client : null;
}

export async function disconnectRedis() {
  await client?.quit();
  client = null;
}
