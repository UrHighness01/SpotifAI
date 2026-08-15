if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-me")
) {
  throw new Error("JWT_SECRET must be set to a non-default value in production");
}

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
