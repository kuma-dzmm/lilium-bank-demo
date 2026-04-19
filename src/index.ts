import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { computeLazyInterest } from "./domain/interest";
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
import {
  decodeOAuthState,
  encodeOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "./storage/oauth-state";
import { renderDashboard } from "./templates/dashboard";
import { renderHome } from "./templates/home";

interface AppBindings {
  ACCOUNT_DO?: DurableObjectNamespace;
  BASE_URL?: string;
  LILIUM_BASE_URL?: string;
  LILIUM_CLIENT_ID?: string;
  LILIUM_CLIENT_SECRET?: string;
  LILIUM_WEBHOOK_SECRET?: string;
  TREASURY_BEARER_TOKEN?: string;
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
    TREASURY_BEARER_TOKEN: bindings.TREASURY_BEARER_TOKEN,
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

export function createApp(fetchImpl: typeof fetch = fetch): AppType {
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
      title: "Bank deposit",
      summary: "Deposit into bank_demo treasury account",
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

    await mutateAccount(c.env.ACCOUNT_DO, session.userId, "finalize-deposit", {
      userId: session.userId,
      intentId: pending.intentId,
      amount: intent.amount ?? pending.amount,
      liliumReferenceId: intent.intent_id,
    });
    deleteCookie(c, DEPOSIT_COOKIE_NAME, { path: "/" });
    return c.redirect("/dashboard", 302);
  });

  app.post("/webhooks/lilium", async (c) => {
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
      await mutateAccount(c.env.ACCOUNT_DO, intent.user_id, "finalize-deposit", {
        userId: intent.user_id,
        intentId: intent.intent_id,
        amount: intent.amount,
        liliumReferenceId: intent.intent_id,
      });
    }

    return c.json({ ok: true });
  });

  app.post("/withdraw", async (c) => {
    const session = requireUserSession(c);
    const config = getConfig(c.env);
    const form = await c.req.formData();
    const amount = parseAmount(String(form.get("amount") ?? ""));
    const summary = await fetchAccountSummary(c.env.ACCOUNT_DO, session.userId);
    const today = new Date().toISOString().slice(0, 10);
    const pendingInterest = computeLazyInterest({
      balance: summary.bankBalance,
      lastInterestAccrualDate: summary.lastInterestAccrualDate,
      today,
    });
    const client = new LiliumClient(
      { baseUrl: config.liliumBaseUrl },
      fetchImpl,
    );

    if (Number(pendingInterest.amount) > 0) {
      const interestTransfer = await client.transferFromTreasury(
        config.treasuryBearerToken,
        {
          toUserId: session.userId,
          amount: pendingInterest.amount,
          memo: "bank_demo daily interest",
        },
      );
      await mutateAccount(c.env.ACCOUNT_DO, session.userId, "finalize-interest", {
        userId: session.userId,
        settlementKey: `${session.userId}:${today}`,
        amount: pendingInterest.amount,
        settledThroughDate: today,
        liliumReferenceId: interestTransfer.reference_id,
      });
    }

    const currentBalance =
      Number(summary.bankBalance) + Number(pendingInterest.amount);
    if (currentBalance < Number(amount)) {
      throw new HTTPException(422, { message: "Insufficient demo balance" });
    }

    const withdrawalTransfer = await client.transferFromTreasury(
      config.treasuryBearerToken,
      {
        toUserId: session.userId,
        amount,
        memo: "bank_demo withdrawal",
      },
    );
    await mutateAccount(c.env.ACCOUNT_DO, session.userId, "withdraw", {
      userId: session.userId,
      amount,
      liliumReferenceId: withdrawalTransfer.reference_id,
    });

    return c.redirect("/dashboard", 302);
  });

  return app;
}

const app = createApp();

export default app;
export { AccountDurableObject };
