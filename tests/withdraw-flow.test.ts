import { describe, expect, it, vi } from "vitest";
import { createEmptyAccount } from "../src/domain/accounts";
import {
  createSessionCookie,
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
} from "./test-utils";

describe("withdrawal and interest", () => {
  it("rejects withdrawals when demo balance is insufficient", async () => {
    const app = createTestApp(vi.fn<typeof fetch>());
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", {
      ...createEmptyAccount("user_123"),
      bankBalance: "5.00",
    });

    const response = await app.request(
      "http://localhost/withdraw",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00", request_id: "withdraw-request-1" }),
      },
      bindings,
    );

    expect(response.status).toBe(422);
    expect(await response.text()).toContain("Insufficient demo balance");
  });

  it("withdraws by clearing payout without settling interest in-request", async () => {
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
            instruction_id: "ci_withdraw",
            status: "executed",
            operation: "payout",
            account_code: "partner_123",
            amount: "10.00",
            user_id: "user_123",
            partner_reference_id: "withdraw:user_123:10.00",
            created_at: "2026-04-19T00:00:00Z",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", {
      ...createEmptyAccount("user_123"),
      bankBalance: "100.00",
      lastInterestAccrualDate: "2026-04-18",
    });

    const response = await app.request(
      "http://localhost/withdraw",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00", request_id: "withdraw-request-2" }),
      },
      bindings,
    );
    const account = await accountNamespace.__getAccount("user_123");

    expect(response.status).toBe(302);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub).toHaveBeenNthCalledWith(
      2,
      "https://lilium.kuma.homes/api/v1/clearing-instructions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"partner_reference_id":"withdraw:withdraw-request-2"'),
      }),
    );
    expect(account.bankBalance).toBe("90.00");
    expect(account.entries.map((entry) => entry.kind)).toEqual([
      "withdrawal_debit",
    ]);
  });

  it("uses a fresh partner reference id for each withdrawal attempt", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "machine_token",
            token_type: "bearer",
            expires_in: 900,
          }),
        ),
      );
    fetchStub
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
            instruction_id: "ci_withdraw_1",
            status: "executed",
            operation: "payout",
            account_code: "partner_123",
            amount: "10.00",
            user_id: "user_123",
            partner_reference_id: "withdraw:user_123:1",
            created_at: "2026-04-20T00:00:00Z",
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
            instruction_id: "ci_withdraw_2",
            status: "executed",
            operation: "payout",
            account_code: "partner_123",
            amount: "10.00",
            user_id: "user_123",
            partner_reference_id: "withdraw:user_123:2",
            created_at: "2026-04-20T00:01:00Z",
          }),
        ),
      );

    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", {
      ...createEmptyAccount("user_123"),
      bankBalance: "100.00",
    });

    await app.request(
      "http://localhost/withdraw",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00", request_id: "withdraw-request-3" }),
      },
      bindings,
    );

    await accountNamespace.__setAccount("user_123", {
      ...createEmptyAccount("user_123"),
      bankBalance: "100.00",
    });

    await app.request(
      "http://localhost/withdraw",
      {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: "10.00", request_id: "withdraw-request-4" }),
      },
      bindings,
    );

    const firstBody = JSON.parse(String(fetchStub.mock.calls[1]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchStub.mock.calls[3]?.[1]?.body));

    expect(firstBody.partner_reference_id).not.toBe(secondBody.partner_reference_id);
  });
});
