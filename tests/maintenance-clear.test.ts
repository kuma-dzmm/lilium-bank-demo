import { describe, expect, it } from "vitest";
import {
  createSeededAccount,
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
  type TestRegistryNamespace,
} from "./test-utils";

describe("maintenance clear", () => {
  it("clears registered account durable objects and the registry", async () => {
    const app = createTestApp();
    const bindings = createTestBindings({
      BANK_DEMO_MAINTENANCE_SECRET: "maintenance_secret",
    });
    const accounts = bindings.ACCOUNT_DO as TestAccountNamespace;
    const registry = bindings.ACCOUNT_REGISTRY_DO as TestRegistryNamespace;

    await accounts.__setAccount("user_1", createSeededAccount("user_1", "10.00"));
    await accounts.__setAccount("user_2", createSeededAccount("user_2", "20.00"));
    await registry.__registerAccount("user_1");
    await registry.__registerAccount("user_2");

    const response = await app.fetch(
      new Request(
        "https://bank.kuma.homes/api/internal/v1/maintenance/durable-objects/clear",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer maintenance_secret",
          },
        },
      ),
      bindings,
    );
    const payload = (await response.json()) as {
      clearedAccounts: string[];
      registryCleared: boolean;
    };

    expect(response.status).toBe(200);
    expect(payload.registryCleared).toBe(true);
    expect(payload.clearedAccounts).toEqual(["user_1", "user_2"]);
    expect(await registry.__listAccounts()).toEqual([]);
    expect((await accounts.__getAccount("user_1")).bankBalance).toBe("0.00");
    expect((await accounts.__getAccount("user_2")).bankBalance).toBe("0.00");
  });

  it("rejects requests without the maintenance bearer token", async () => {
    const app = createTestApp();
    const bindings = createTestBindings({
      BANK_DEMO_MAINTENANCE_SECRET: "maintenance_secret",
    });

    const response = await app.fetch(
      new Request(
        "https://bank.kuma.homes/api/internal/v1/maintenance/durable-objects/clear",
        {
          method: "POST",
        },
      ),
      bindings,
    );

    expect(response.status).toBe(401);
  });
});
