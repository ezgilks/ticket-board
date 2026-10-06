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

// Each guest seeds a board and triggers AI calls against a free-tier quota, so creating them
// is limited separately and more tightly than password attempts.
export const guestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => config.NODE_ENV === "test" && process.env["RATE_LIMIT_IN_TESTS"] !== "1",
  message: { error: "Too many demo accounts from this network. Try again later or register." },
});

// On-demand triage spends the same LLM quota, and unlike creation nothing else slows it down.
// Behind requireAuth, so it's keyed per user rather than per IP.
export const triageRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? "anonymous",
  skip: () => config.NODE_ENV === "test" && process.env["RATE_LIMIT_IN_TESTS"] !== "1",
  message: { error: "Too many triage requests, try again later" },
});
