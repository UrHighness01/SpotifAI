import nodemailer, { Transporter } from "nodemailer";

const EMAIL_FROM = process.env.EMAIL_FROM || "SpotifAI <no-reply@spotifai.local>";

if (process.env.NODE_ENV === "production" && !process.env.SMTP_HOST) {
  throw new Error("SMTP_HOST (and SMTP_PORT/SMTP_USER/SMTP_PASS) must be set to send email in production");
}

let transporter: Transporter;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    // Dev fallback: no SMTP configured, so print the message instead of sending it.
    // Blocked in production by the guard above.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const info = await getTransporter().sendMail({ from: EMAIL_FROM, to, subject, text, html });
  if (!process.env.SMTP_HOST) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
  }
  void info;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const safeUrl = escapeHtml(verifyUrl);
  await sendMail(
    to,
    "Verify your SpotifAI email",
    `Confirm your email to activate your SpotifAI account:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create this account, ignore this email.`,
    `<p>Confirm your email to activate your SpotifAI account.</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>This link expires in 24 hours. If you didn't create this account, ignore this email.</p>`
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const safeUrl = escapeHtml(resetUrl);
  await sendMail(
    to,
    "Reset your SpotifAI password",
    `Reset your SpotifAI password:\n\n${resetUrl}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, ignore this email and your password will stay unchanged.`,
    `<p>Reset your SpotifAI password.</p><p><a href="${safeUrl}">${safeUrl}</a></p><p>This link expires in 1 hour and can only be used once. If you didn't request this, ignore this email and your password will stay unchanged.</p>`
  );
}
