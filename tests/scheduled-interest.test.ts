import { describe, expect, it } from "vitest";
import { createEmptyAccount } from "../src/domain/accounts";
import {
  createTestBindings,
  type TestAccountNamespace,
  type TestRegistryNamespace,
} from "./test-utils";
import { runDailyInterestAccrual } from "../src/index";

describe("scheduled interest", () => {
  it("accrues interest internally for all registered accounts", async () => {
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    const registryNamespace = bindings.ACCOUNT_REGISTRY_DO as TestRegistryNamespace;

    await accountNamespace.__setAccount("user_123", {
      ...createEmptyAccount("user_123"),
      bankBalance: "100.00",
      lastInterestAccrualDate: "2026-04-18",
    });
    await registryNamespace.__registerAccount("user_123");

    await runDailyInterestAccrual(bindings, "2026-04-19");

    const account = await accountNamespace.__getAccount("user_123");
    expect(account.bankBalance).toBe("100.10");
    expect(account.lastInterestAccrualDate).toBe("2026-04-19");
    expect(account.entries.map((entry) => entry.kind)).toEqual([
      "interest_credit",
    ]);
  });
});
