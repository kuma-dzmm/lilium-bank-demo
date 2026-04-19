import { describe, expect, it, vi } from "vitest";
import { LiliumClient } from "../src/lilium-client";

describe("LiliumClient", () => {
  it("builds an authorization URL using the public OIDC endpoint", () => {
    const client = new LiliumClient(
      { baseUrl: "https://lilium.kuma.homes" },
      fetch,
    );

    const url = client.buildAuthorizeUrl({
      redirectUri: "https://bank-demo.example/auth/callback",
      clientId: "demo_client",
      state: "state_123",
      nonce: "nonce_123",
    });

    expect(url).toContain("/oauth/authorize");
    expect(url).toContain("client_id=demo_client");
    expect(url).toContain("scope=openid+profile");
  });

  it("posts payment intents with machine bearer auth", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          intent_id: "pi_123",
          checkout_url: "https://lilium.kuma.homes/checkout/co_123",
          status: "pending_user_confirmation",
          expires_at: "2026-04-19T00:00:00Z",
        }),
      ),
    );
    const client = new LiliumClient(
      { baseUrl: "https://lilium.kuma.homes" },
      fetchStub as typeof fetch,
    );

    await client.createPaymentIntent("machine_token", {
      userId: "user_123",
      amount: "10.00",
      partnerReferenceId: "deposit_123",
      returnUrl: "https://bank-demo.example/deposit/return",
      cancelUrl: "https://bank-demo.example/deposit/cancel",
      title: "莉莉银行存款",
      summary: "将资金存入莉莉银行账户",
    });

    expect(fetchStub).toHaveBeenCalledWith(
      "https://lilium.kuma.homes/api/v1/payment-intents",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer machine_token",
          "Idempotency-Key": "deposit_123",
        }),
      }),
    );
  });

  it("posts clearing payout instructions with machine bearer auth", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          instruction_id: "ci_123",
          status: "executed",
          operation: "payout",
          account_code: "partner_123",
          amount: "2.50",
          user_id: "user_123",
          partner_reference_id: "withdraw:user_123:2.50",
          created_at: "2026-04-19T00:00:00Z",
        }),
      ),
    );
    const client = new LiliumClient(
      { baseUrl: "https://lilium.kuma.homes" },
      fetchStub as typeof fetch,
    );

    await client.createPayoutInstruction("machine_token", {
      userId: "user_123",
      amount: "2.50",
      partnerReferenceId: "withdraw:user_123:2.50",
      note: "莉莉银行取款",
    });

    expect(fetchStub).toHaveBeenCalledWith(
      "https://lilium.kuma.homes/api/v1/clearing-instructions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer machine_token",
        }),
      }),
    );
  });
});
