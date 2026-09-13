import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stand-in for ai-service over real HTTP. Its "embedding" is a bag-of-words vector
 * (one dimension per hashed word), so texts sharing words are similar — enough to
 * test the SQL and wiring without loading an ML model.
 */
export function wordVector(text: string): number[] {
  const v = new Array(384).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0;
    for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) % 384;
    v[h] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export async function startFakeAi(
  triage: (body: { title: string }) => unknown = () => ({ labels: [], priority: "MEDIUM", provider: "fake" }),
) {
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
    });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/embed") res.end(JSON.stringify({ vectors: body.texts.map(wordVector) }));
      else if (req.url === "/triage") res.end(JSON.stringify(triage(body)));
      else res.writeHead(404).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise((r) => server.close(r)) };
}
