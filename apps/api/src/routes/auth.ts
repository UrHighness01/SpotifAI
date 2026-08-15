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
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: "email already registered" });
  }
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

  res.status(201).json({
    user: publicUser(user),
    message: "Registered. Check your email to verify your account before logging in.",
    // DEV MODE (no SMTP configured): the email is only printed to the
    // console, so surface the verification link here so testers can actually
    // complete registration. NEVER exposed in production (SMTP must be set;
    // the email is the only channel there).
    ...(process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST ? { devVerifyUrl: verifyUrl } : {}),
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
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
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
