# Stage 8 — Razorpay paywall (M7)

## Goal

The AI endpoints require an active "Pro" subscription. A free user who tries AI sees a paywall modal, pays in Razorpay **test mode**, and gets access. Access is granted **only** by the verified `payment.captured` webhook, never by the browser's success callback.

## Tasks

### 1. Config and secrets

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` in `env.ts`, plus plan constants in code: `PRO_MONTHLY = { plan: "pro_monthly", amountPaise: 19900, days: 30 }` (pick your amount — always integers in paise).
- Terraform: add the three `/whiteboard/prod/RAZORPAY_*` SecureString parameters with placeholders + `ignore_changes`; set the real test-mode values with the CLI.
- In the Razorpay dashboard (test mode), create a webhook to `https://<cloudfront>/api/payments/webhook` for `payment.captured` (optionally `payment.failed`), with the webhook secret.

### 2. Backend

**`integrations/razorpay.client.ts`** — the only file importing the `razorpay` SDK:
- `createOrder({ amountPaise, receipt, notes })` → `{ id, amount, currency }`.
- `verifyWebhookSignature(rawBody: Buffer, signature: string): boolean` — `createHmac("sha256", webhookSecret).update(rawBody).digest("hex")`, compared with `crypto.timingSafeEqual` (check lengths first; `timingSafeEqual` throws on unequal lengths).

**`middlewares/rawBody.ts`** — the webhook route must see the exact bytes Razorpay sent. Register the webhook route inside its own encapsulated Fastify plugin that replaces the JSON parser: `app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => done(null, body))`. The encapsulation keeps every other route on the normal parser. (The `fastify-raw-body` plugin is the alternative.)

**Repositories**
- `payment.repository.ts`: `createOrderRecord`, `findByOrderId`, and **`captureAndActivate(orderId, paymentId, userId, expiresAt)`**, which does in one `prisma.$transaction`: update Payment → `CAPTURED` with `razorpayPaymentId`, upsert Subscription → `ACTIVE` with `expiresAt`.
- `subscription.repository.ts`: `findByUserId`.

**`services/payment.service.ts`**
- `createOrder(userId)`: call the client, store `Payment { status: CREATED, amountPaise, razorpayOrderId }`, return `{ orderId, amountPaise, currency, keyId }`.
- `handleWebhook(rawBody, signature)`:
  1. Verify signature, else `AppError(400, "INVALID_SIGNATURE")`.
  2. Parse JSON from the raw body. Ignore events other than `payment.captured` (return OK).
  3. Find the Payment by `payload.payment.entity.order_id`. Unknown order → log and return OK (don't make Razorpay retry forever).
  4. Check the captured amount equals the stored `amountPaise`.
  5. **Idempotency:** already `CAPTURED` → return OK. The unique `razorpayPaymentId` makes a concurrent duplicate fail harmlessly; catch Prisma's unique-violation (`P2002`) and treat it as success.
  6. `expiresAt = max(now, current expiresAt) + 30 days`, then `captureAndActivate`.
- `services/subscription.service.ts` (or in payment service): `isActive(userId)` → `status === ACTIVE && expiresAt > now`. Expiry is checked at read time, so no cron is needed; optionally mark `EXPIRED` lazily.

**Middleware `requireSubscription.ts`**: calls `isActive(req.user.id)`, else `AppError(402, "SUBSCRIPTION_REQUIRED")`. Add it to both AI routes: `[authenticate, requireSubscription, rateLimit, validate]`.

**Routes** (`payment.routes.ts`): `POST /payments/order` (authenticate), `POST /payments/webhook` (rawBody only — no auth, the signature is the auth). The webhook always responds quickly with 200 on success.

**`GET /me`** already returns subscription status (Stage 3); make sure it uses `isActive` semantics.

**Tests**
- Unit: signature verification (valid, tampered body, wrong length); webhook idempotency (second delivery is a no-op); amount mismatch rejected; expiry extension.
- Integration: sign a fixture body with a test secret, `app.inject` it with the raw payload → subscription becomes active; replaying it changes nothing; AI route returns 402 before and passes after.

### 3. Frontend (`features/billing/`)

- `PaywallDialog.tsx` (shadcn `Dialog`): what Pro includes, price, "Upgrade" button. Opens when an AI request returns 402, or when a free user focuses the prompt bar (show a Pro badge on the bar).
- Load `https://checkout.razorpay.com/v1/checkout.js` on demand (a `loadScript` helper; don't add it to `index.html`).
- Upgrade flow: `POST /api/payments/order` → `new Razorpay({ key, order_id, amount, currency, name, prefill: { email }, handler, modal: { ondismiss } }).open()`.
- In `handler` (the success callback): **don't** mark the user as Pro. Show "Confirming payment…" and poll `GET /api/me` every 2 s for up to ~60 s until the subscription is active, then close the dialog and retry the AI request the user started. On timeout: "Payment received; access will activate shortly," with a refresh button.
- Account menu shows plan and expiry date.

### 4. Local testing of the webhook

Razorpay can't reach `localhost`. Either test webhooks only on the deployed CloudFront URL, or run a tunnel (`cloudflared tunnel --url http://localhost:5173`, or ngrok) and point a second test-mode webhook at it. Integration tests with self-signed fixture bodies cover the logic without either.

## Done when

- [ ] Free user: AI requests return 402 and open the paywall.
- [ ] Paying with a Razorpay test card/UPI ID in test mode activates Pro within seconds on the deployed app; the AI prompt then works.
- [ ] Closing the checkout, or a failed test payment, leaves the user on Free with a `CREATED`/`FAILED` payment row.
- [ ] Re-sending the webhook from the Razorpay dashboard doesn't create a second subscription period.
- [ ] A webhook with a modified body or wrong signature returns 400 and changes nothing.
- [ ] Setting `expiresAt` in the past in the DB puts the user back behind the paywall.

## Gotchas

- **Raw body:** verification fails on re-serialized JSON. Verify against the exact bytes; don't `JSON.stringify(req.body)`.
- CloudFront forwards the `X-Razorpay-Signature` header only because the `/api/*` behaviour uses `AllViewerExceptHostHeader` (Stage 2). If you ever tighten the origin request policy, keep this header.
- Test-mode and live-mode keys and webhook secrets are different. This project only ever uses test mode.
