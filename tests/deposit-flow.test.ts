import { describe, expect, it, vi } from "vitest";
import {
  createSessionCookie,
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
} from "./test-utils";

function extractSetCookieValue(response: Response, cookieName: string): string {
  const raw = response.headers.get("set-cookie") ?? "";
  const segment = raw
    .split(", ")
    .find((part) => part.startsWith(`${cookieName}=`));
  return segment ?? raw;
}

describe("deposit flow", () => {
  it("creates a payment intent and redirects to hosted checkout", async () => {
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
            checkout_url: "https://lilium.kuma.homes/checkout/co_123",
            status: "pending_user_confirmation",
            expires_at: "2026-04-19T00:00:00Z",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const response = await app.request(
      "http://localhost/deposit",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00" }),
      },
      bindings,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://lilium.kuma.homes/checkout/co_123",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "bank_demo_pending_deposit=",
    );
  });

  it("creates a reserve payment intent when locked clearing mode is selected", async () => {
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
            intent_id: "pi_reserve_123",
            checkout_url: "https://lilium.kuma.homes/checkout/co_reserve_123",
            status: "pending_user_confirmation",
            operation: "reserve",
            expires_at: "2026-04-19T00:00:00Z",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();

    const response = await app.request(
      "http://localhost/deposit",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00", mode: "reserve" }),
      },
      bindings,
    );

    expect(response.status).toBe(302);
    expect(fetchStub).toHaveBeenNthCalledWith(
      2,
      "https://lilium.kuma.homes/api/v1/payment-intents",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"operation":"reserve"'),
      }),
    );
  });

  it("credits the demo ledger only once per payment intent id", async () => {
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
            checkout_url: "https://lilium.kuma.homes/checkout/co_123",
            expires_at: "2026-04-19T00:00:00Z",
          }),
        ),
      )
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
            checkout_url: "https://lilium.kuma.homes/checkout/co_123",
            expires_at: "2026-04-19T00:00:00Z",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    const pendingDepositCookie =
      "bank_demo_pending_deposit=eyJpbnRlbnRJZCI6InBpXzEyMyIsImFtb3VudCI6IjEwLjAwIn0=";
    const baseCookie = `${createSessionCookie()}; ${pendingDepositCookie}`;

    const firstResponse = await app.request(
      "http://localhost/deposit/return",
      {
        headers: {
          Cookie: baseCookie,
        },
      },
      bindings,
    );
    const secondResponse = await app.request(
      "http://localhost/deposit/return",
      {
        headers: {
          Cookie: baseCookie,
        },
      },
      bindings,
    );
    const account = await accountNamespace.__getAccount("user_123");

    expect(firstResponse.status).toBe(302);
    expect(secondResponse.status).toBe(302);
    expect(account.bankBalance).toBe("10.00");
    expect(account.entries).toHaveLength(1);
    expect(account.entries[0]?.kind).toBe("deposit_credit");
  });

  it("commits an authorized reserve intent before crediting the demo ledger", async () => {
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
            intent_id: "pi_reserve_123",
            amount: "10.00",
            user_id: "user_123",
            operation: "reserve",
            status: "authorized",
            checkout_url: "https://lilium.kuma.homes/checkout/co_reserve_123",
            expires_at: "2026-04-19T00:00:00Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            instruction_id: "ci_commit_123",
            status: "executed",
            operation: "commit",
            account_code: "partner_123",
            amount: "10.00",
            user_id: "user_123",
            partner_reference_id: "commit:pi_reserve_123",
            created_at: "2026-04-19T00:00:00Z",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    const reserveDepositCookie =
      "bank_demo_pending_deposit=eyJpbnRlbnRJZCI6InBpX3Jlc2VydmVfMTIzIiwiYW1vdW50IjoiMTAuMDAiLCJtb2RlIjoicmVzZXJ2ZSJ9";
    const baseCookie = `${createSessionCookie()}; ${reserveDepositCookie}`;

    const response = await app.request(
      "http://localhost/deposit/return",
      {
        headers: {
          Cookie: baseCookie,
        },
      },
      bindings,
    );
    const account = await accountNamespace.__getAccount("user_123");

    expect(response.status).toBe(302);
    expect(fetchStub).toHaveBeenNthCalledWith(
      3,
      "https://lilium.kuma.homes/api/v1/clearing-instructions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"operation":"commit"'),
      }),
    );
    expect(account.bankBalance).toBe("10.00");
    expect(account.entries[0]?.kind).toBe("deposit_credit");
  });
});
