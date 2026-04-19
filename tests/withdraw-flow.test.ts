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

  it("settles pending interest before a withdrawal", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            from_user_id: "treasury_user",
            to_user_id: "user_123",
            amount: "0.10",
            from_balance: "999.90",
            reference_id: "wt_interest",
            created_at: "2026-04-19T00:00:00Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            from_user_id: "treasury_user",
            to_user_id: "user_123",
            amount: "10.00",
            from_balance: "989.90",
            reference_id: "wt_withdraw",
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
    expect(account.bankBalance).toBe("90.10");
    expect(account.entries.map((entry) => entry.kind)).toEqual([
      "interest_credit",
      "withdrawal_debit",
    ]);
  });
});
