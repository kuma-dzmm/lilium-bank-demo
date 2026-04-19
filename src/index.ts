import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { readConfig } from "./config";
import { LiliumClient } from "./lilium-client";
import {
  decodePendingDepositCookie,
  decodeSessionCookie,
  encodePendingDepositCookie,
  encodeSessionCookie,
  SESSION_COOKIE_NAME,
  type UserSession,
  DEPOSIT_COOKIE_NAME,
} from "./session";
import { AccountDurableObject } from "./storage/account-do";
import { AccountRegistryDurableObject } from "./storage/account-registry-do";
import {
  decodeOAuthState,
  encodeOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "./storage/oauth-state";
import { renderDashboard } from "./templates/dashboard";
import { renderHome } from "./templates/home";

interface AppBindings {
  ACCOUNT_DO?: DurableObjectNamespace;
  ACCOUNT_REGISTRY_DO?: DurableObjectNamespace;
  BASE_URL?: string;
  LILIUM_BASE_URL?: string;
  LILIUM_CLIENT_ID?: string;
  LILIUM_CLIENT_SECRET?: string;
  LILIUM_WEBHOOK_SECRET?: string;
}

interface AppVariables {
  userSession: UserSession | null;
}

type AppType = Hono<{ Bindings: AppBindings; Variables: AppVariables }>;

function requireUserSession(c: { get(key: "userSession"): UserSession | null }): UserSession {
  const session = c.get("userSession");
  if (!session) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }
  return session;
}

function getConfig(bindings: AppBindings) {
  return readConfig({
    BASE_URL: bindings.BASE_URL,
    LILIUM_BASE_URL: bindings.LILIUM_BASE_URL,
    LILIUM_CLIENT_ID: bindings.LILIUM_CLIENT_ID,
    LILIUM_CLIENT_SECRET: bindings.LILIUM_CLIENT_SECRET,
    LILIUM_WEBHOOK_SECRET: bindings.LILIUM_WEBHOOK_SECRET,
  });
}

function parseAmount(amount: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new HTTPException(422, { message: "Invalid amount" });
  }
  return Number(amount).toFixed(2);
}

async function fetchAccountSummary(
  namespace: DurableObjectNamespace | undefined,
  userId: string,
) {
  if (!namespace) {
    return {
      userId,
      bankBalance: "0.00",
      lastInterestAccrualDate: new Date().toISOString().slice(0, 10),
      entries: [],
    };
  }

  const id = namespace.idFromName(userId);
  const stub = namespace.get(id);
  const response = await stub.fetch(
    `https://account.internal/summary?user_id=${encodeURIComponent(userId)}`,
  );
  return (await response.json()) as {
    userId: string;
    bankBalance: string;
    lastInterestAccrualDate: string;
    entries: Array<{ kind: string; amount: string; balanceAfter: string }>;
  };
}

async function mutateAccount(
  namespace: DurableObjectNamespace | undefined,
  userId: string,
  path: string,
  payload: unknown,
) {
  if (!namespace) {
    throw new Error("ACCOUNT_DO binding is required");
  }

  const id = namespace.idFromName(userId);
  const stub = namespace.get(id);
  const response = await stub.fetch(`https://account.internal/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function registerAccount(
  namespace: DurableObjectNamespace | undefined,
  userId: string,
) {
  if (!namespace) {
    throw new Error("ACCOUNT_REGISTRY_DO binding is required");
  }

  const id = namespace.idFromName("registry");
  const stub = namespace.get(id);
  await stub.fetch("https://registry.internal/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  });
}

async function listRegisteredAccounts(
  namespace: DurableObjectNamespace | undefined,
): Promise<string[]> {
  if (!namespace) {
    return [];
  }

  const id = namespace.idFromName("registry");
  const stub = namespace.get(id);
  const response = await stub.fetch("https://registry.internal/accounts");
  return (await response.json()) as string[];
}

export async function runDailyInterestAccrual(
  bindings: AppBindings,
  settledThroughDate = new Date().toISOString().slice(0, 10),
) {
  const userIds = await listRegisteredAccounts(bindings.ACCOUNT_REGISTRY_DO);
  await Promise.all(
    userIds.map((userId) =>
      mutateAccount(bindings.ACCOUNT_DO, userId, "accrue-interest", {
        userId,
        settledThroughDate,
      }),
    ),
  );
}

export function createApp(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): AppType {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  app.use("*", async (c, next) => {
    c.set("userSession", decodeSessionCookie(getCookie(c, SESSION_COOKIE_NAME)));
    await next();
  });

  app.get("/", (c) => c.html(renderHome()));

  app.get("/auth/login", (c) => {
    const config = getConfig(c.env);
    const redirectUri = `${config.baseUrl}/auth/callback`;
    const stateRecord = {
      state: crypto.randomUUID(),
      nonce: crypto.randomUUID(),
      redirectUri,
    };
    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );

    setCookie(c, OAUTH_STATE_COOKIE_NAME, encodeOAuthState(stateRecord), {
      httpOnly: true,
      path: "/",
    });

    return c.redirect(
      client.buildAuthorizeUrl({
        redirectUri,
        clientId: config.oidcClientId,
        state: stateRecord.state,
        nonce: stateRecord.nonce,
      }),
      302,
    );
  });

  app.get("/auth/callback", async (c) => {
    const config = getConfig(c.env);
    const oauthState = decodeOAuthState(getCookie(c, OAUTH_STATE_COOKIE_NAME));
    const state = c.req.query("state");
    const code = c.req.query("code");

    if (!oauthState || !state || !code || oauthState.state !== state) {
      throw new HTTPException(400, { message: "Invalid OAuth state" });
    }

    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );
    const tokens = await client.exchangeAuthorizationCode({
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
      code,
      redirectUri: oauthState.redirectUri,
    });
    const profile = await client.getUserInfo(tokens.access_token);

    setCookie(
      c,
      SESSION_COOKIE_NAME,
      encodeSessionCookie({
        userId: profile.sub,
        displayName: profile.display_name ?? profile.sub,
        avatarUrl: profile.avatar_url ?? null,
        oidcAccessToken: tokens.access_token,
        oidcRefreshToken: tokens.refresh_token ?? null,
      }),
      {
        httpOnly: true,
        path: "/",
      },
    );
    deleteCookie(c, OAUTH_STATE_COOKIE_NAME, { path: "/" });
    return c.redirect("/dashboard", 302);
  });

  app.get("/dashboard", async (c) => {
    const session = requireUserSession(c);
    const summary = await fetchAccountSummary(c.env.ACCOUNT_DO, session.userId);
    return c.html(
      renderDashboard({
        displayName: session.displayName,
        userId: session.userId,
        bankBalance: summary.bankBalance,
        lastInterestAccrualDate: summary.lastInterestAccrualDate,
        entries: summary.entries,
      }),
    );
  });

  app.post("/deposit", async (c) => {
    const session = requireUserSession(c);
    const config = getConfig(c.env);
    const form = await c.req.formData();
    const amount = parseAmount(String(form.get("amount") ?? ""));
    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );
    const machineToken = await client.issueMachineToken({
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
    });
    const created = await client.createPaymentIntent(machineToken.access_token, {
      userId: session.userId,
      amount,
      partnerReferenceId: `deposit:${session.userId}:${Date.now()}`,
      returnUrl: `${config.baseUrl}/deposit/return`,
      cancelUrl: `${config.baseUrl}/dashboard`,
      title: "莉莉银行存款",
      summary: "将资金存入莉莉银行账户",
    });

    setCookie(
      c,
      DEPOSIT_COOKIE_NAME,
      encodePendingDepositCookie({ intentId: created.intent_id, amount }),
      {
        httpOnly: true,
        path: "/",
      },
    );

    return c.redirect(created.checkout_url, 302);
  });

  app.get("/deposit/return", async (c) => {
    const session = requireUserSession(c);
    const pending = decodePendingDepositCookie(getCookie(c, DEPOSIT_COOKIE_NAME));
    if (!pending) {
      throw new HTTPException(400, { message: "Missing pending deposit" });
    }

    const config = getConfig(c.env);
    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );
    const machineToken = await client.issueMachineToken({
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
    });
    const intent = await client.getPaymentIntent(
      machineToken.access_token,
      pending.intentId,
    );

    if (!["authorized", "released", "succeeded"].includes(intent.status)) {
      throw new HTTPException(409, { message: "Deposit not finalized on Lilium" });
    }

    await registerAccount(c.env.ACCOUNT_REGISTRY_DO, session.userId);
    await mutateAccount(c.env.ACCOUNT_DO, session.userId, "finalize-deposit", {
      userId: session.userId,
      intentId: pending.intentId,
      amount: intent.amount ?? pending.amount,
      liliumReferenceId: intent.intent_id,
    });
    deleteCookie(c, DEPOSIT_COOKIE_NAME, { path: "/" });
    return c.redirect("/dashboard", 302);
  });

  const handleLiliumWebhook = async (
    c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  ) => {
    const config = getConfig(c.env);
    const providedSecret = c.req.header("x-lilium-webhook-secret");
    if (!config.webhookSecret || providedSecret !== config.webhookSecret) {
      throw new HTTPException(401, { message: "Invalid webhook secret" });
    }

    const body = (await c.req.json()) as {
      type: string;
      data?: { id?: string };
    };
    if (!body.data?.id) {
      throw new HTTPException(400, { message: "Missing resource id" });
    }

    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );
    const machineToken = await client.issueMachineToken({
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
    });
    const intent = await client.getPaymentIntent(machineToken.access_token, body.data.id);

    if (
      body.type.startsWith("payment_intent.") &&
      ["authorized", "released", "succeeded"].includes(intent.status) &&
      intent.user_id &&
      intent.amount
    ) {
      await registerAccount(c.env.ACCOUNT_REGISTRY_DO, intent.user_id);
      await mutateAccount(c.env.ACCOUNT_DO, intent.user_id, "finalize-deposit", {
        userId: intent.user_id,
        intentId: intent.intent_id,
        amount: intent.amount,
        liliumReferenceId: intent.intent_id,
      });
    }

    return c.json({ ok: true });
  };

  app.post("/webhooks/lilium", handleLiliumWebhook);

  app.post("/withdraw", async (c) => {
    const session = requireUserSession(c);
    const config = getConfig(c.env);
    const form = await c.req.formData();
    const amount = parseAmount(String(form.get("amount") ?? ""));
    const summary = await fetchAccountSummary(c.env.ACCOUNT_DO, session.userId);
    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );

    if (Number(summary.bankBalance) < Number(amount)) {
      throw new HTTPException(422, { message: "Insufficient demo balance" });
    }

    const machineToken = await client.issueMachineToken({
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
    });
    const withdrawalTransfer = await client.createPayoutInstruction(
      machineToken.access_token,
      {
        userId: session.userId,
        amount,
        partnerReferenceId: `withdraw:${session.userId}:${amount}`,
        note: "莉莉银行取款",
      },
    );
    await mutateAccount(c.env.ACCOUNT_DO, session.userId, "withdraw", {
      userId: session.userId,
      amount,
      liliumReferenceId: withdrawalTransfer.instruction_id,
    });

    return c.redirect("/dashboard", 302);
  });

  return app;
}

const app = createApp();
const worker = {
  fetch: app.fetch,
  scheduled: async (
    _controller: ScheduledController,
    env: AppBindings,
  ) => {
    await runDailyInterestAccrual(env);
  },
};

export default worker;
export { AccountDurableObject, AccountRegistryDurableObject };
