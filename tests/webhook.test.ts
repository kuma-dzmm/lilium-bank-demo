import { describe, expect, it, vi } from "vitest";
import {
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
} from "./test-utils";

async function signWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("lilium webhook", () => {
  it("accepts timestamped HMAC webhook signatures", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "machine_token",
            token_type: "bearer",
            expires_in: 900,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            intent_id: "pi_123",
            amount: "10.00",
            user_id: "user_123",
            status: "succeeded",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    const timestamp = "2026-04-20T04:20:00Z";
    const rawBody = JSON.stringify({
      type: "payment_intent.succeeded",
      data: { id: "pi_123" },
    });

    const response = await app.request(
      "http://localhost/webhooks/lilium",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lilium-Timestamp": timestamp,
          "X-Lilium-Signature": await signWebhook(
            "webhook_secret",
            timestamp,
            rawBody,
          ),
        },
        body: rawBody,
      },
      bindings,
    );
    const account = await accountNamespace.__getAccount("user_123");

    expect(response.status).toBe(200);
    expect(account.bankBalance).toBe("10.00");
    expect(account.entries[0]?.kind).toBe("deposit_credit");
  });

  it("ignores non payment intent webhook events", async () => {
    const fetchStub = vi.fn<typeof fetch>();
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    const timestamp = "2026-04-20T04:25:00Z";
    const rawBody = JSON.stringify({
      type: "clearing_instruction.executed",
      data: { id: "ci_123" },
    });

    const response = await app.request(
      "http://localhost/webhooks/lilium",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Lilium-Timestamp": timestamp,
          "X-Lilium-Signature": await signWebhook(
            "webhook_secret",
            timestamp,
            rawBody,
          ),
        },
        body: rawBody,
      },
      bindings,
    );
    const account = await accountNamespace.__getAccount("user_123");

    expect(response.status).toBe(200);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(account.bankBalance).toBe("0.00");
    expect(account.entries).toHaveLength(0);
  });
});
