import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("worker app", () => {
  it("renders the public home page with external-platform copy", async () => {
    const response = await app.request("http://localhost/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("bank_demo");
    expect(html).toContain("third-party demo");
    expect(html).toContain("Sign in with Lilium");
  });
});
