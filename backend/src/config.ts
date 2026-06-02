import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: (process.env.CORS_ORIGIN || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  databaseUrl: required("DATABASE_URL"),
  mailProviderBaseUrl: required(
    "MAIL_PROVIDER_BASE_URL",
    "https://secret.zspoof.com",
  ),
  mailProviderApiKey: required("MAIL_PROVIDER_API_KEY"),
  pricePerEmail: parseFloat(process.env.PRICE_PER_EMAIL || "0.003"),
};
