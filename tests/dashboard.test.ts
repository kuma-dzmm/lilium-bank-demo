import { describe, expect, it, vi } from "vitest";
import {
  createSeededAccount,
  createSessionCookie,
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
} from "./test-utils";

describe("dashboard balances", () => {
  it("shows user cash via user token and bank cash via client token", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user_id: "user_123",
            balance: "123.45",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "machine_token",
            token_type: "bearer",
            expires_in: 900,
            scope: "wallet:read clearing:basic",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user_id: "partner_123",
            balance: "987.65",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", createSeededAccount("user_123", "55.00"));

    const response = await app.request(
      "http://localhost/dashboard",
      {
        headers: {
          Cookie: createSessionCookie({
            oidcAccessToken: "oidc_user_token",
          }),
        },
      },
      bindings,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("用户现金");
    expect(html).toContain("$123.45");
    expect(html).toContain("user token");
    expect(html).toContain("银行清算账户现金");
    expect(html).toContain("$987.65");
    expect(html).toContain("client token");
    expect(html).toContain("银行内部余额");
    expect(html).toContain("$55.00");
    expect(html).toContain('name="request_id"');
  });

  it("refreshes an expired user token before reading wallet balance", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired token",
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "oidc_access_token_fresh",
            refresh_token: "oidc_refresh_token_fresh",
            token_type: "bearer",
            expires_in: 900,
            scope: "openid profile wallet:read",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user_id: "user_123",
            balance: "123.45",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "machine_token",
            token_type: "bearer",
            expires_in: 900,
            scope: "wallet:read clearing:basic",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user_id: "partner_123",
            balance: "987.65",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", createSeededAccount("user_123", "55.00"));

    const response = await app.request(
      "http://localhost/dashboard",
      {
        headers: {
          Cookie: createSessionCookie({
            oidcAccessToken: "oidc_access_token_stale",
            oidcRefreshToken: "oidc_refresh_token_old",
          }),
        },
      },
      bindings,
    );

    expect(response.status).toBe(200);
    expect(fetchStub).toHaveBeenNthCalledWith(
      2,
      "https://lilium.kuma.homes/oauth/token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(response.headers.get("set-cookie")).toContain("bank_demo_session=");
  });

  it("redirects to login when the refresh token is invalid", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid or expired token",
            },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "INVALID_REFRESH_TOKEN",
              message: "invalid refresh token",
            },
          }),
          { status: 401 },
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount("user_123", createSeededAccount("user_123", "55.00"));

    const response = await app.request(
      "http://localhost/dashboard",
      {
        headers: {
          Cookie: createSessionCookie({
            oidcAccessToken: "oidc_access_token_stale",
            oidcRefreshToken: "oidc_refresh_token_invalid",
          }),
        },
      },
      bindings,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/login");
    expect(response.headers.get("set-cookie")).toContain("bank_demo_session=;");
  });
});
