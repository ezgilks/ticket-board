import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { unauthorized } from "./errors.js";

// A JWT is a signed JSON payload. The server signs { sub: userId } with a secret;
// later, verifying the signature proves the server issued it and nobody edited it.
// Nothing is stored server-side — that's what makes it "stateless" auth.
export function signToken(userId: string): string {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: userId,
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] & string,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): string {
  try {
    // Pinning the algorithm blocks the classic "alg: none" / algorithm-confusion attacks.
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub) throw new Error("bad payload");
    return payload.sub;
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}
