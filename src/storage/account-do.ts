import { createEmptyAccount, type DemoAccountState } from "../domain/accounts";
import { appendLedgerEntry } from "../domain/ledger";

export class AccountDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/summary" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") ?? "";
      const stored = await this.state.storage.get<DemoAccountState>("account");
      return Response.json(stored ?? createEmptyAccount(userId));
    }

    if (url.pathname === "/finalize-deposit" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        intentId: string;
        amount: string;
        liliumReferenceId: string;
      };
      const finalizedIntentIds =
        (await this.state.storage.get<string[]>("finalizedIntentIds")) ?? [];
      const current =
        (await this.state.storage.get<DemoAccountState>("account")) ??
        createEmptyAccount(body.userId);

      if (finalizedIntentIds.includes(body.intentId)) {
        return Response.json(current);
      }

      const nextBalance = (
        Number(current.bankBalance) + Number(body.amount)
      ).toFixed(2);
      const nextState = appendLedgerEntry(current, {
        kind: "deposit_credit",
        amount: body.amount,
        balanceAfter: nextBalance,
        liliumReferenceId: body.liliumReferenceId,
      });
      await this.state.storage.put("account", nextState);
      await this.state.storage.put("finalizedIntentIds", [
        ...finalizedIntentIds,
        body.intentId,
      ]);
      return Response.json(nextState);
    }

    if (url.pathname === "/finalize-interest" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        settlementKey: string;
        amount: string;
        settledThroughDate: string;
        liliumReferenceId: string;
      };
      const finalizedInterestKeys =
        (await this.state.storage.get<string[]>("finalizedInterestKeys")) ?? [];
      const current =
        (await this.state.storage.get<DemoAccountState>("account")) ??
        createEmptyAccount(body.userId);

      if (finalizedInterestKeys.includes(body.settlementKey)) {
        return Response.json(current);
      }

      const nextBalance = (
        Number(current.bankBalance) + Number(body.amount)
      ).toFixed(2);
      const nextState = {
        ...appendLedgerEntry(current, {
          kind: "interest_credit",
          amount: body.amount,
          balanceAfter: nextBalance,
          liliumReferenceId: body.liliumReferenceId,
        }),
        lastInterestAccrualDate: body.settledThroughDate,
      };
      await this.state.storage.put("account", nextState);
      await this.state.storage.put("finalizedInterestKeys", [
        ...finalizedInterestKeys,
        body.settlementKey,
      ]);
      return Response.json(nextState);
    }

    if (url.pathname === "/accrue-interest" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        settledThroughDate: string;
      };
      const current =
        (await this.state.storage.get<DemoAccountState>("account")) ??
        createEmptyAccount(body.userId);

      const elapsedDays = Math.max(
        0,
        Math.floor(
          (Date.parse(`${body.settledThroughDate}T00:00:00Z`) -
            Date.parse(`${current.lastInterestAccrualDate}T00:00:00Z`)) /
            86_400_000,
        ),
      );
      if (elapsedDays <= 0) {
        return Response.json(current);
      }

      const amount = (
        Number(current.bankBalance) *
        0.001 *
        elapsedDays
      ).toFixed(2);
      const nextBalance = (
        Number(current.bankBalance) + Number(amount)
      ).toFixed(2);
      const nextState = {
        ...appendLedgerEntry(current, {
          kind: "interest_credit",
          amount,
          balanceAfter: nextBalance,
          liliumReferenceId: `interest:${body.userId}:${body.settledThroughDate}`,
        }),
        lastInterestAccrualDate: body.settledThroughDate,
      };
      await this.state.storage.put("account", nextState);
      return Response.json(nextState);
    }

    if (url.pathname === "/withdraw" && request.method === "POST") {
      const body = (await request.json()) as {
        userId: string;
        amount: string;
        liliumReferenceId: string;
      };
      const current =
        (await this.state.storage.get<DemoAccountState>("account")) ??
        createEmptyAccount(body.userId);
      const nextBalance = (
        Number(current.bankBalance) - Number(body.amount)
      ).toFixed(2);
      const nextState = appendLedgerEntry(current, {
        kind: "withdrawal_debit",
        amount: `-${body.amount}`,
        balanceAfter: nextBalance,
        liliumReferenceId: body.liliumReferenceId,
      });
      await this.state.storage.put("account", nextState);
      return Response.json(nextState);
    }

    return new Response("Not Found", { status: 404 });
  }
}
