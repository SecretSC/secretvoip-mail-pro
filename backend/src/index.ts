import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import emailRoutes from "./routes/email.js";
import adminRoutes from "./routes/admin.js";
import campaignRoutes from "./routes/campaigns.js";
import templateRoutes from "./routes/templates.js";
import settingsRoutes from "./routes/settings.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigin.includes("*") || config.corsOrigin.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));

// Rate limit auth endpoints harder than the rest
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api", apiLimiter, meRoutes);
app.use("/api/email", apiLimiter, emailRoutes);
app.use("/api/admin", apiLimiter, adminRoutes);
app.use("/api/campaigns", apiLimiter, campaignRoutes);
app.use("/api/templates", apiLimiter, templateRoutes);
app.use("/api/settings", apiLimiter, settingsRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error("[error]", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(config.port, () => {
  console.log(
    `[secretvoip-mail] listening on :${config.port} (${config.nodeEnv})`,
  );
});
