import { Router } from "express";
import * as auth from "../services/auth.js";
import { requireAuth, userIdOf } from "../middleware/auth.js";

// Routes stay thin: parse input, call a service, send the result.
export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const input = auth.RegisterInput.parse(req.body);
  res.status(201).json(await auth.register(input));
});

authRouter.post("/login", async (req, res) => {
  const input = auth.LoginInput.parse(req.body);
  res.json(await auth.login(input));
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await auth.getMe(userIdOf(req)) });
});
