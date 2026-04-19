import { describe, expect, it, vi } from "vitest";
import { createTestApp, createTestBindings } from "./test-utils";

function getCookieHeader(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
}

describe("auth routes", () => {
  it("redirects /auth/login to the public Lilium authorize endpoint", async () => {
    const app = createTestApp();
    const bindings = createTestBindings();
    const response = await app.request(
      "http://localhost/auth/login",
      undefined,
      bindings,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/oauth/authorize");
    expect(response.headers.get("location")).toContain("wallet%3Aread");
    expect(getCookieHeader(response)).toContain("bank_demo_oauth_state=");
  });

  it("creates a user session on callback", async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "oidc_access_token",
            refresh_token: "oidc_refresh_token",
            token_type: "bearer",
            expires_in: 900,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "user_123",
            display_name: "熊猫用户",
            avatar_url: "https://example.com/avatar.png",
          }),
        ),
      );
    const app = createTestApp(fetchStub);
    const bindings = createTestBindings();
    const loginResponse = await app.request(
      "http://localhost/auth/login",
      undefined,
      bindings,
    );
    const oauthCookie = getCookieHeader(loginResponse);
    const location = new URL(loginResponse.headers.get("location") ?? "");
    const state = location.searchParams.get("state");

    const callbackResponse = await app.request(
      `http://localhost/auth/callback?state=${state}&code=code_123`,
      {
        headers: {
          Cookie: oauthCookie,
        },
      },
      bindings,
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/dashboard");
    expect(getCookieHeader(callbackResponse)).toContain("bank_demo_session=");
  });
});
