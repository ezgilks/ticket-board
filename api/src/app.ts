import express from "express";
import cors from "cors";
import helmet from "helmet";
import { corsOrigins } from "./config.js";
import { yoga } from "./graphql/index.js";
import { authRouter } from "./routes/auth.js";
import { boardsRouter } from "./routes/boards.js";
import { columnsRouter } from "./routes/columns.js";
import { ticketsRouter } from "./routes/tickets.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";

// Building the app is separate from listening on a port, so tests can
// hand the app straight to Supertest without opening a real socket.
export function createApp() {
  const app = express();

  // Behind Render's / AWS's load balancer, the client IP arrives in X-Forwarded-For.
  app.set("trust proxy", 1);
  app.use(cors({ origin: corsOrigins }));

  // GraphQL is mounted before helmet: helmet's Content-Security-Policy would block the
  // GraphiQL explorer's scripts. Yoga parses its own request bodies.
  app.use(yoga.graphqlEndpoint, yoga);

  app.use(helmet()); // sensible security headers
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  // Everything below requires a valid token.
  app.use("/boards", requireAuth, boardsRouter);
  app.use("/columns", requireAuth, columnsRouter);
  app.use("/tickets", requireAuth, ticketsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });
  app.use(errorHandler);

  return app;
}
