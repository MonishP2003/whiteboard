import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createRazorpayClient, verifySignature } from "../../src/integrations/razorpay.client.js";

const SECRET = "whsec_test";
const body = Buffer.from('{"event":"payment.captured","payload":{}}');
const sign = (b: Buffer, secret = SECRET) => createHmac("sha256", secret).update(b).digest("hex");

describe("verifySignature", () => {
  test("accepts the HMAC of the exact bytes", () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  test("rejects a tampered body", () => {
    const tampered = Buffer.from(body.toString().replace("captured", "failed"));
    expect(verifySignature(tampered, sign(body), SECRET)).toBe(false);
  });

  test("rejects a different secret", () => {
    expect(verifySignature(body, sign(body, "other"), SECRET)).toBe(false);
  });

  test("rejects a wrong-length signature without throwing", () => {
    expect(verifySignature(body, sign(body).slice(0, 10), SECRET)).toBe(false);
    expect(verifySignature(body, "", SECRET)).toBe(false);
    expect(verifySignature(body, `${sign(body)}00`, SECRET)).toBe(false);
  });

  test("re-serialized JSON doesn't verify when the bytes differ", () => {
    const spaced = Buffer.from('{ "event": "payment.captured", "payload": {} }');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(spaced.toString())));
    expect(verifySignature(reserialized, sign(spaced), SECRET)).toBe(false);
  });
});

describe("createRazorpayClient", () => {
  test("without keys, createOrder is PAYMENTS_NOT_CONFIGURED", async () => {
    const client = createRazorpayClient({ webhookSecret: SECRET });
    expect(client.keyId).toBeNull();
    await expect(
      client.createOrder({ amountPaise: 100, currency: "INR", receipt: "r" }),
    ).rejects.toMatchObject({ status: 503, code: "PAYMENTS_NOT_CONFIGURED" });
  });

  test("without a webhook secret, verification is PAYMENTS_NOT_CONFIGURED", () => {
    const client = createRazorpayClient({});
    expect(() => client.verifyWebhookSignature(body, sign(body))).toThrow(
      expect.objectContaining({ status: 503, code: "PAYMENTS_NOT_CONFIGURED" }),
    );
  });
});
