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
      title: "Bank deposit",
      summary: "Deposit into bank_demo treasury account",
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

  it("posts wallet transfers with treasury bearer auth", async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          from_user_id: "treasury_user",
          to_user_id: "user_123",
          amount: "2.50",
          from_balance: "97.50",
          reference_id: "wt_123",
          created_at: "2026-04-19T00:00:00Z",
        }),
      ),
    );
    const client = new LiliumClient(
      { baseUrl: "https://lilium.kuma.homes" },
      fetchStub as typeof fetch,
    );

    await client.transferFromTreasury("treasury_token", {
      toUserId: "user_123",
      amount: "2.50",
      memo: "bank_demo daily interest",
    });

    expect(fetchStub).toHaveBeenCalledWith(
      "https://lilium.kuma.homes/api/wallet/transfer",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer treasury_token",
        }),
      }),
    );
  });
});
