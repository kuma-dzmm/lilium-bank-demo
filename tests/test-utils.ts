import type { DemoAccountState } from "../src/domain/accounts";
import { createEmptyAccount } from "../src/domain/accounts";
import { createApp } from "../src/index";
import { encodeSessionCookie, SESSION_COOKIE_NAME } from "../src/session";
import { AccountDurableObject } from "../src/storage/account-do";

type FakeStorage = Map<string, unknown>;

function createFakeState(storage: FakeStorage): DurableObjectState {
  return {
    storage: {
      get: async <T>(key: string) => storage.get(key) as T | undefined,
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
    },
  } as DurableObjectState;
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) {
    return input;
  }

  return new Request(input.toString(), init);
}

export interface TestAccountNamespace extends DurableObjectNamespace {
  __getAccount(userId: string): Promise<DemoAccountState>;
  __setAccount(userId: string, account: DemoAccountState): Promise<void>;
}

export function createTestAccountNamespace(): TestAccountNamespace {
  const storages = new Map<string, FakeStorage>();
  const objects = new Map<string, AccountDurableObject>();

  const getObject = (userId: string) => {
    if (!storages.has(userId)) {
      storages.set(userId, new Map<string, unknown>());
    }
    if (!objects.has(userId)) {
      const state = createFakeState(storages.get(userId)!);
      objects.set(userId, new AccountDurableObject(state));
    }
    return objects.get(userId)!;
  };

  return {
    idFromName(name: string) {
      return name as unknown as DurableObjectId;
    },
    get(id: DurableObjectId) {
      const userId = String(id);
      const object = getObject(userId);
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          return object.fetch(toRequest(input, init));
        },
      } as DurableObjectStub;
    },
    async __getAccount(userId: string) {
      const response = await getObject(userId).fetch(
        new Request(`https://account.internal/summary?user_id=${userId}`),
      );
      return (await response.json()) as DemoAccountState;
    },
    async __setAccount(userId: string, account: DemoAccountState) {
      const storage = storages.get(userId) ?? new Map<string, unknown>();
      storage.set("account", account);
      storages.set(userId, storage);
      objects.set(userId, new AccountDurableObject(createFakeState(storage)));
    },
  } as TestAccountNamespace;
}

export function createTestBindings(
  overrides: Partial<Record<string, string | DurableObjectNamespace>> = {},
) {
  return {
    ACCOUNT_DO: createTestAccountNamespace(),
    BASE_URL: "http://localhost",
    LILIUM_BASE_URL: "https://lilium.kuma.homes",
    LILIUM_CLIENT_ID: "demo_client",
    LILIUM_CLIENT_SECRET: "demo_secret",
    LILIUM_WEBHOOK_SECRET: "webhook_secret",
    TREASURY_BEARER_TOKEN: "treasury_token",
    ...overrides,
  };
}

export function createSessionCookie(overrides: Partial<{
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}> = {}) {
  return `${SESSION_COOKIE_NAME}=${encodeSessionCookie({
    userId: overrides.userId ?? "user_123",
    displayName: overrides.displayName ?? "Demo User",
    avatarUrl: overrides.avatarUrl ?? null,
  })}`;
}

export function createTestApp(fetchImpl: typeof fetch = fetch) {
  return createApp(fetchImpl);
}

export function createSeededAccount(userId: string, balance: string): DemoAccountState {
  return {
    ...createEmptyAccount(userId),
    bankBalance: balance,
  };
}
