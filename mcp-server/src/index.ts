#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { TicketBoardApi } from "./api.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

// Entry point for local use: the MCP client (Claude Desktop, Claude Code, the Inspector)
// starts this process and talks JSON-RPC over its stdin/stdout.
//
// stdout belongs to the protocol. Anything written there that isn't a JSON-RPC message
// corrupts the stream, so every log line goes to stderr (console.error).

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  console.error(`ticketboard-mcp: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const api = new TicketBoardApi(config.apiUrl, config.credentials);
const handle = serveStdio(() => createServer(api), {
  // Without this, a request the SDK can't parse as JSON-RPC is dropped with no reply and no
  // trace, and the client waits on it until it times out. Logging can't send the missing
  // reply, but it makes the hang diagnosable from the host's server log.
  // SDK bug, see docs/mcp-sdk-friction-log.md#1-stdio-drops-invalid-requests-without-a-reply
  onerror: (err) => console.error(`ticketboard-mcp: ${err.message}`),
});
console.error(`ticketboard-mcp: serving on stdio, API ${config.apiUrl}`);

process.on("SIGINT", () => void handle.close());
process.on("SIGTERM", () => void handle.close());
