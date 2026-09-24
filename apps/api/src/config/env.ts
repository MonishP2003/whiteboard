import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Image tag (commit SHA) of this build; `/api/health` reports it so a deploy can confirm it's live. */
  APP_VERSION: z.string().min(1).default("dev"),
  /**
   * Proxies in front of the API whose `X-Forwarded-For` entries are trusted, so `req.ip` is
   * the real client. Prod: 2 (Caddy + CloudFront). 0 trusts none.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  /** Optional so tests and CI run without one; the AI routes return 503 until it's set. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.6-flash"),
  /**
   * Razorpay test-mode credentials. Optional like the Gemini key: without them the payment
   * routes return 503 and every AI route stays behind the paywall.
   */
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
