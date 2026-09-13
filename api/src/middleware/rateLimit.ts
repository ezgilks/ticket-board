import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";

// Slows down password guessing: at most 20 login/register attempts per IP per 15 minutes.
// Counts are kept in memory, i.e. per API instance — acceptable for a brute-force speed bump.
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Off in tests unless a test opts in, so the suite can register many users quickly.
  skip: () => config.NODE_ENV === "test" && process.env["RATE_LIMIT_IN_TESTS"] !== "1",
  message: { error: "Too many attempts, try again later" },
});
