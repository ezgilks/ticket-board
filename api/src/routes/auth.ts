import { Router } from "express";
import * as auth from "../services/auth.js";
import { requireAuth, userIdOf } from "../middleware/auth.js";
import { authRateLimit, guestRateLimit } from "../middleware/rateLimit.js";
import { createGuest } from "../services/guests.js";

// Routes stay thin: parse input, call a service, send the result.
export const authRouter = Router();

// Rate-limit only the endpoints that check passwords. /me runs on every page load.
authRouter.post("/register", authRateLimit, async (req, res) => {
  const input = auth.RegisterInput.parse(req.body);
  res.status(201).json(await auth.register(input));
});

authRouter.post("/login", authRateLimit, async (req, res) => {
  const input = auth.LoginInput.parse(req.body);
  res.json(await auth.login(input));
});

// One click to a temporary account with a demo board. Returns the board id so the client
// can open it directly.
authRouter.post("/guest", guestRateLimit, async (_req, res) => {
  res.status(201).json(await createGuest());
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await auth.getMe(userIdOf(req)) });
});
