import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthedUser } from "../types";

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

export function signSession(user: AuthedUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: "7d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as AuthedUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
