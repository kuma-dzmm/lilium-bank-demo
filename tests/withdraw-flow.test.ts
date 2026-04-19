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
        body: new URLSearchParams({ amount: "10.00" }),
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
        body: new URLSearchParams({ amount: "10.00" }),
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
      }),
    );
    expect(account.bankBalance).toBe("90.00");
    expect(account.entries.map((entry) => entry.kind)).toEqual([
      "withdrawal_debit",
    ]);
  });
});
