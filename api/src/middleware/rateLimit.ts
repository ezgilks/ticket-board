import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";

// Slows down password guessing: at most 20 login/register attempts per IP per 15 minutes.
// Counts are kept in memory, i.e. per API instance — acceptable for a brute-force speed bump.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.NODE_ENV === "test",
  message: { error: "Too many attempts, try again later" },
});
