import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { JWT_SECRET } from "./secrets";

const ISSUER = "spotifai-api";
const AUDIENCE = "spotifai-web";

export interface SessionPayload {
  userId: string;
  tokenVersion: number;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "30d",
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: randomUUID(),
  });
}

export function verifySessionToken(token: string): SessionPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as jwt.JwtPayload;
  return {
    userId: decoded.userId as string,
    tokenVersion: typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0,
  };
}
