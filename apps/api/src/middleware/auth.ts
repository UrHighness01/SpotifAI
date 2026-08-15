import { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { verifySessionToken } from "../lib/jwt";

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }
  try {
    const payload = verifySessionToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      res.status(401).json({ error: "session revoked" });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "invalid session" });
  }
}
