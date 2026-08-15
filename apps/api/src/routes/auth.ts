import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { sleep } from "../lib/timing";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { signSessionToken } from "../lib/jwt";
import { generateToken, hashToken } from "../lib/tokens";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";

const router = Router();

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:5173";
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
// Floor so "account exists" (DB write + email send) and "account doesn't exist"
// (early return) take about the same wall-clock time — otherwise the response
// timing itself leaks which emails are registered even though the body doesn't.
const ENUMERATION_TIMING_FLOOR_MS = 150;

async function withTimingFloor<T>(work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await work();
  const elapsed = Date.now() - start;
  if (elapsed < ENUMERATION_TIMING_FLOOR_MS) {
    await sleep(ENUMERATION_TIMING_FLOOR_MS - elapsed);
  }
  return result;
}

function setSessionCookie(res: any, userId: string, tokenVersion: number) {
  const token = signSessionToken({ userId, tokenVersion });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(user: { id: string; email: string; displayName: string; createdAt: Date; emailVerified: boolean }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified,
  };
}

router.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "email, password, and displayName are required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  // F1 (John's review — MEDIUM): an existing account used to return a
  // distinct 409 "email already registered", making this a public
  // enrollment oracle. Now BOTH cases return the same "check your email"
  // response (with the same timing floor) so an attacker can't distinguish
  // registered from unregistered emails.
  await withTimingFloor(async () => {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);
    const { raw, hash } = generateToken();
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName,
        emailVerificationTokenHash: hash,
        emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    const verifyUrl = `${WEB_ORIGIN}/verify-email?token=${raw}`;
    await sendVerificationEmail(user.email, verifyUrl);
    // Dev mode: surface the verification link (email only prints to console).
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      res.locals.devVerifyUrl = verifyUrl;
    }
  });

  // Generic response in both cases — no enrollment oracle.
  res.status(201).json({
    message: "If this email isn't registered yet, a verification email was sent.",
    ...(process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST ? { devVerifyUrl: res.locals.devVerifyUrl } : {}),
  });
});

router.post("/verify-email", async (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token is required" });
  }
  const hash = hashToken(token);
  // Atomic conditional update instead of read-then-write: the where clause
  // re-checks the hash and expiry at write time, so two concurrent requests
  // with the same token can't both observe it as still-valid before either commits.
  const { count } = await prisma.user.updateMany({
    where: {
      emailVerificationTokenHash: hash,
      emailVerificationExpires: { gt: new Date() },
    },
    data: {
      emailVerified: true,
      emailVerificationTokenHash: null,
      emailVerificationExpires: null,
    },
  });
  if (count === 0) {
    return res.status(400).json({ error: "invalid or expired verification link" });
  }
  res.json({ message: "Email verified. You can now log in." });
});

router.post("/resend-verification", async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const genericResponse = () =>
    res.json({
      message: "If that account exists and isn't verified yet, a new verification email was sent.",
      // Dev mode: include the fresh link so the user can verify (the email is
      // only in the console). Absent otherwise.
      ...(res.locals.devVerifyUrl ? { devVerifyUrl: res.locals.devVerifyUrl } : {}),
    });

  await withTimingFloor(async () => {
    if (!normalizedEmail) return;
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.emailVerified) return;

    // F2 (John's review — MEDIUM): don't rotate an OUTSTANDING unexpired
    // verification token — otherwise anyone who knows the email can keep
    // invalidating the current link (token-DoS) and race the user to
    // verification. Only issue a fresh token when the previous one has
    // expired or was never issued.
    if (user.emailVerificationTokenHash && user.emailVerificationExpires && user.emailVerificationExpires > new Date()) {
      return;
    }

    const { raw, hash } = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: hash,
        emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    const verifyUrl = `${WEB_ORIGIN}/verify-email?token=${raw}`;
    await sendVerificationEmail(user.email, verifyUrl);
    // Dev mode (no SMTP): the email is only printed to the console, so return
    // the fresh verification link so the user can complete verification. Same
    // anti-enumeration posture otherwise — this only fires for an existing,
    // unverified account, and only in dev.
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      res.locals.devVerifyUrl = verifyUrl;
    }
  });

  genericResponse();
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  // F3 (John's review — MEDIUM): for a known email the bcrypt.compare is
  // ~100ms slower than the findUnique early-return for an unknown one —
  // response timing leaked which emails are registered. The timing floor +
  // a fake bcrypt compare for unknown users makes both paths take the same
  // wall-clock time.
  const { user, valid } = await withTimingFloor(async () => {
    const found = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!found) {
      // Same cost as the real compare below — indistinguishable timing.
      await bcrypt.compare(password, "$2a$10$CwTycUXWue0Thq9StjUM0uJ8tS3L8vXm2r7lQaK0nYx5Tq1n1y1eK");
      return { user: null, valid: false };
    }
    const ok = await bcrypt.compare(password, found.passwordHash);
    return { user: found, valid: ok };
  });
  if (!user || !valid) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  if (!user.emailVerified) {
    return res.status(403).json({ error: "email not verified", code: "EMAIL_NOT_VERIFIED" });
  }
  setSessionCookie(res, user.id, user.tokenVersion);
  res.json({ user: publicUser(user) });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.status(204).end();
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(401).json({ error: "not authenticated" });
  res.json({ user: publicUser(user) });
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const genericResponse = () =>
    res.json({ message: "If that email is registered, a password reset link has been sent." });

  await withTimingFloor(async () => {
    if (!normalizedEmail) return;
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return;

    const { raw, hash } = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hash,
        passwordResetExpires: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const resetUrl = `${WEB_ORIGIN}/reset-password?token=${raw}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  });

  genericResponse();
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "token is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  const hash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 10);
  // Atomic conditional update (see verify-email) so a concurrent second use of
  // the same reset token can't slip through between the read and the write.
  const { count } = await prisma.user.updateMany({
    where: {
      passwordResetTokenHash: hash,
      passwordResetExpires: { gt: new Date() },
    },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      // Invalidate every existing session (including the one that may have been
      // hijacked if this reset was triggered because of a leaked password).
      tokenVersion: { increment: 1 },
    },
  });
  if (count === 0) {
    return res.status(400).json({ error: "invalid or expired reset link" });
  }
  res.json({ message: "Password reset. You can now log in with your new password." });
});

export default router;
