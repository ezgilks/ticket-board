# MCP SDK friction log

Rough edges hit in the **MCP SDK itself** (not in this project) while building `mcp-server/`.
Each entry was checked against the SDK's issue tracker before being called a bug. Where the
project works around one, the code links back here.

**Versions:** `@modelcontextprotocol/server` and `@modelcontextprotocol/client` **2.3.1**
(TypeScript SDK v2, released 2026-10-05, tag `v2.3.1`, commit `fcef852`), Node 24.10, TypeScript 7.0.
The SDK implements spec revision **2026-07-28** and still serves 2025-era clients through the
`initialize` handshake. Tracker checks done 2026-10-06.

| # | Summary | Kind | Upstream status |
|---|---|---|---|
| 1 | stdio drops an invalid request without replying; the client hangs | Bug | Known: #563, #2247. Fix PRs #2000, #2488 open, idle since 2026-08-18 |
| 2 | `LATEST_PROTOCOL_VERSION` / `SUPPORTED_PROTOCOL_VERSIONS` cover the 2025 era only and have no docs | Confusing API | Known: #2410. Fix PRs #2417 and #2585 closed unmerged |
| 3 | HTTP `-32600` replies echo the request `id` for some invalid shapes but not others | Inconsistency | Not reported |
| 4 | Inspector CLI: options before the server command fail with an unrelated error | Adjacent tool (Inspector 2.9.0) | Not reported |

Checked and **ruled out** as SDK bugs (so nobody re-investigates them):
- A `resources/read` miss answers `-32602` although `ProtocolErrorCode.ResourceNotFound` is `-32002`.
  This is deliberate: spec 2026-07-28 requires `-32602` on every revision, and the enum's JSDoc says so.
- Non-JSON lines on stdin are skipped silently instead of getting `-32700`. Also deliberate
  (#1762): it tolerates hot-reload tools that write to stdout.
- `initialize` asking for `2026-07-28` is answered with `2025-11-25`. That's correct: 2026-07-28
  has no `initialize`, so the server falls back to its newest revision that does.

---

## 1. stdio drops invalid requests without a reply

**Kind:** bug · **Package:** `@modelcontextprotocol/server` 2.3.1 (`serveStdio`, `StdioServerTransport`)

**Expected:** a message that parses as JSON but isn't a valid JSON-RPC request, such as
`{"jsonrpc":"2.0","id":2,"method":123}`, gets `{"jsonrpc":"2.0","id":2,"error":{"code":-32600,…}}`.
JSON-RPC 2.0 §5 requires a reply, and the SDK's own HTTP entry sends one (`-32600`, HTTP 400).

**Actual:** over stdio, nothing is written back. The client's request `2` stays pending until its
own timeout. Without an `onerror` callback there's no trace at all. With one, the callback gets the
raw multi-line Zod issue dump as `error.message`.

**Reproduction** (standalone, nothing but the SDK):

```js
// npm i @modelcontextprotocol/server@2.3.1 && node repro.mjs
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
serveStdio(() => new McpServer({ name: "repro", version: "1.0.0" }), {
  onerror: (e) => console.error("[onerror]", e.message.slice(0, 80)),
});
```

```bash
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"raw","version":"0"}}}'
(echo "$INIT"; sleep 0.3; echo '{"jsonrpc":"2.0","id":2,"method":123}'; sleep 0.3; echo '{"jsonrpc":"2.0","id":3,"method":"ping"}'; sleep 0.5) | node repro.mjs
```

Output: replies for ids 1 and 3, none for id 2, and `[onerror] [ { "code": "invalid_union", …` on stderr.
`{"jsonrpc":"1.0","id":9,"method":"ping"}` behaves the same way.

**Where:** `packages/core-internal/src/shared/stdio.ts`, `ReadBuffer.readMessage()`. A schema
failure (as opposed to a `SyntaxError`) is rethrown and the parsed frame is discarded. Then
`packages/server/src/server/stdio.ts`, `processReadBuffer()`, routes it to `onerror` and moves on,
so no code path still has the `id` to reply to.

**Upstream:** issues [#563](https://github.com/modelcontextprotocol/typescript-sdk/issues/563)
(open since 2025-05) and [#2247](https://github.com/modelcontextprotocol/typescript-sdk/issues/2247).
PR [#2488](https://github.com/modelcontextprotocol/typescript-sdk/pull/2488) fixes exactly this:
it keeps the parsed frame and replies `-32600` when an id is recoverable. It's open, last updated
2026-08-18. The older [#2000](https://github.com/modelcontextprotocol/typescript-sdk/pull/2000)
overlaps it.

**Contribution idea:** confirm on #2488 that it still reproduces on 2.3.1 with the script above,
and offer to rebase it. No new PR needed. Separately, `onerror` getting a raw Zod dump could be
filed as its own small DX issue: a summary message, with the issues kept on `cause`.

**Workaround here:** `mcp-server/src/index.ts` passes `onerror` to `serveStdio` and logs to stderr,
so the hang at least shows in the host's server log. It can't send the missing reply.

---

## 2. Protocol-version constants cover the 2025 era only, with no docs

**Kind:** confusing API / missing docs · **Package:** `@modelcontextprotocol/core` 2.3.1, re-exported by `server` and `client`

**Expected:** a package that implements spec 2026-07-28 and says so in its README would export
`LATEST_PROTOCOL_VERSION === "2026-07-28"`, or document why not.

**Actual:**

```bash
node -e 'import("@modelcontextprotocol/server").then(m => console.log(m.LATEST_PROTOCOL_VERSION, m.SUPPORTED_PROTOCOL_VERSIONS))'
# 2025-11-25 [ '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07' ]
```

The constants mean "versions the 2025-era `initialize` handshake negotiates", but the shipped
`.d.mts` has no doc comment on any of them. So `SUPPORTED_PROTOCOL_VERSIONS.includes("2026-07-28")`
is `false` in a release that serves 2026-07-28.

**Where:** `packages/core-internal/src/types/constants.ts`, which re-exports from
`spec.types.2025-11-25.ts`. The 2026-07-28 value lives in `spec.types.2026-07-28.ts` but is `@internal`.

**Upstream:** reported in [#2410](https://github.com/modelcontextprotocol/typescript-sdk/issues/2410).
Two fixes were closed without merging:
- [#2417](https://github.com/modelcontextprotocol/typescript-sdk/pull/2417), from a maintainer: rename to era-scoped constants.
- [#2585](https://github.com/modelcontextprotocol/typescript-sdk/pull/2585), from an outside contributor: add TSDoc only.

**Contribution idea:** don't open a third PR blind. Ask on #2410 which direction the maintainers
want (doc comment, rename, or deprecation), then do that.

**Workaround here:** none needed, since this server never reads these constants.

---

## 3. HTTP `-32600` replies echo the `id` inconsistently

**Kind:** minor inconsistency, spec-permitted · **Package:** `@modelcontextprotocol/server` 2.3.1 (`createMcpHandler`)

**Observed** (POSTing to `handler.fetch`):

| Body | Reply |
|---|---|
| `{"jsonrpc":"2.0","id":7,"method":123}` | 400, `-32600`, `"id": null` |
| `{"jsonrpc":"1.0","id":9,"method":"ping"}` | 400, `-32600`, `"id": 9` |

JSON-RPC allows `null` when the id "can't be detected", but in the first case it's right there, and
the two shapes take different paths. Without the id, a client can't tell which pending request failed.

**Where:** the modern-era classifier rejects with no id
(`packages/core-internal/src/shared/inboundClassification.ts`, the `invalid-json-rpc-body` rejection).
The second shape reaches a path that echoes the id.

**Upstream:** no matching issue found. Low priority, but it would pair naturally with #2488 so both
transports recover the id the same way.

---

## 4. Inspector CLI: option order gives an unrelated error

**Kind:** adjacent tooling (`@modelcontextprotocol/inspector` **2.9.0**, not the SDK)

**Expected:** `--help` documents `inspector-cli [options] [target...]`, so options can come first.

**Actual:**

```bash
npx @modelcontextprotocol/inspector@2.9.0 --cli --method tools/list node dist/index.js
# {"error":{"code":"error","message":"No servers found in config file"}}
npx @modelcontextprotocol/inspector@2.9.0 --cli node dist/index.js --method tools/list   # works
```

No config file was involved. The server command must come straight after `--cli`, and the error
points at the wrong cause. A `--` separator doesn't help either: it reports `Method is required`.

**Upstream:** no matching issue in `modelcontextprotocol/inspector`. Worth filing, or fixing either
the help text or the parsing.

---

## What worked without friction

Recorded so the log isn't mistaken for "the SDK is rough everywhere":
- Zod 4 schemas (`import { z } from "zod"`, not just `zod/v4`) gave correct JSON Schema, argument
  validation and handler types, and `.describe()` survived into `tools/list`.
- With `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` on, TypeScript 7 type-checked
  the SDK's published types cleanly even with `skipLibCheck: false` (given `"types": ["node"]`, as
  the README says).
- Both eras from one factory: a 2026-07-28 client through `createMcpHandler`, a 2025 client through
  `InMemoryTransport`, and `versionNegotiation: "auto"` over real stdio all worked on the first try.
- `serveStdio` exits cleanly on stdin EOF.
