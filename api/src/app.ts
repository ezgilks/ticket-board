import express from "express";
import cors from "cors";
import helmet from "helmet";
import { corsOrigins } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { errorHandler } from "./middleware/error.js";

// Building the app is separate from listening on a port, so tests can
// hand the app straight to Supertest without opening a real socket.
export function createApp() {
  const app = express();

  app.use(helmet()); // sensible security headers
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });
  app.use(errorHandler);

  return app;
}
