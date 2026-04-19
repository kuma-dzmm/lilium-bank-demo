import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";

describe("worker app", () => {
  it("renders the public home page with external-platform copy", async () => {
    const app = createApp();
    const response = await app.request("http://localhost/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("bank_demo");
    expect(html).toContain("第三方演示银行");
    expect(html).toContain("使用 Lilium 登录");
  });
});
