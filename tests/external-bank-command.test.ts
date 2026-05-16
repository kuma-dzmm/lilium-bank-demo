import { describe, expect, it } from "vitest";
import {
  createSeededAccount,
  createTestApp,
  createTestBindings,
  type TestAccountNamespace,
} from "./test-utils";

const SHARED_SECRET = "external_command_secret";

async function createSignedInvokeRequest(
  url: string,
  envelope: unknown,
  secret = SHARED_SECRET,
): Promise<Request> {
  const body = JSON.stringify(envelope);
  const idempotencyKey =
    typeof envelope === "object" &&
    envelope !== null &&
    "invocation_id" in envelope
      ? String(envelope.invocation_id)
      : crypto.randomUUID();
  const contentDigest = `sha-256=:${await sha256Base64(body)}:`;
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "idempotency-key": idempotencyKey,
    "content-digest": contentDigest,
  };
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 30;
  const signatureParams =
    `("@method" "@authority" "@path" "content-type" "accept" ` +
    `"idempotency-key" "content-digest");created=${created};` +
    `expires=${expires};keyid="bank";alg="hmac-sha256"`;
  const signatureInput = `lilium=${signatureParams}`;
  const parsedUrl = new URL(url);
  const signatureBase = [
    `"@method": POST`,
    `"@authority": ${parsedUrl.host}`,
    `"@path": ${parsedUrl.pathname}${parsedUrl.search}`,
    `"content-type": ${headers["content-type"]}`,
    `"accept": ${headers.accept}`,
    `"idempotency-key": ${headers["idempotency-key"]}`,
    `"content-digest": ${headers["content-digest"]}`,
    `"@signature-params": ${signatureParams}`,
  ].join("\n");
  const signature = await hmacSha256(secret, signatureBase);

  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": headers["content-type"],
      Accept: headers.accept,
      "Idempotency-Key": headers["idempotency-key"],
      "Content-Digest": headers["content-digest"],
      "Signature-Input": signatureInput,
      Signature: `lilium=:${signature}:`,
    },
    body,
  });
}

function bankInvokeEnvelope(invocationId = "cmd_bank_test") {
  return {
    api_version: "lilium.external-command.v1",
    type: "command.invoke",
    invocation_id: invocationId,
    sent_at: new Date().toISOString(),
    command: {
      config_id: "bank",
      name: "/bank",
      matched_name: "/bank",
      args: "",
    argv: [] as string[],
      raw_text: "/bank",
      mode: "stateless",
    },
    room: {
      id: "room_test",
      type: "group",
    },
    sender: {
      id: "user_123",
    },
    message: {
      id: "msg_bank_test",
      text: "/bank",
      created_at: new Date().toISOString(),
    },
  };
}

describe("external /bank command", () => {
  it("returns the sender's internal bank balance as a reply effect", async () => {
    const app = createTestApp();
    const bindings = createTestBindings({
      LILIUM_EXTERNAL_COMMAND_SECRET: SHARED_SECRET,
    });
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount(
      "user_123",
      createSeededAccount("user_123", "55.00"),
    );

    const response = await app.fetch(
      await createSignedInvokeRequest(
        "https://bank.kuma.homes/api/lilium/external-commands/v1/bank/invoke",
        bankInvokeEnvelope(),
      ),
      bindings,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      effects: Array<{ type: string; text: string; markdown: boolean }>;
    };

    expect(payload.status).toBe("ok");
    expect(payload.effects[0]).toMatchObject({
      type: "reply",
      markdown: false,
    });
    expect(payload.effects[0]?.text).toContain("$55.00");
  });

  it("rejects unsigned or incorrectly signed requests", async () => {
    const app = createTestApp();
    const bindings = createTestBindings({
      LILIUM_EXTERNAL_COMMAND_SECRET: SHARED_SECRET,
    });
    const accountNamespace = bindings.ACCOUNT_DO as TestAccountNamespace;
    await accountNamespace.__setAccount(
      "user_123",
      createSeededAccount("user_123", "55.00"),
    );

    const response = await app.fetch(
      await createSignedInvokeRequest(
        "https://bank.kuma.homes/api/lilium/external-commands/v1/bank/invoke",
        bankInvokeEnvelope("cmd_bad_signature"),
        "wrong_secret",
      ),
      bindings,
    );

    expect(response.status).toBe(401);
  });

  it("does not accept arguments for querying another user's balance", async () => {
    const app = createTestApp();
    const bindings = createTestBindings({
      LILIUM_EXTERNAL_COMMAND_SECRET: SHARED_SECRET,
    });
    const envelope = bankInvokeEnvelope("cmd_bank_args");
    envelope.command.args = "user_456";
    envelope.command.argv = ["user_456"];
    envelope.command.raw_text = "/bank user_456";

    const response = await app.fetch(
      await createSignedInvokeRequest(
        "https://bank.kuma.homes/api/lilium/external-commands/v1/bank/invoke",
        envelope,
      ),
      bindings,
    );
    const payload = (await response.json()) as {
      status: string;
      effects: Array<{ text: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("rejected");
    expect(payload.effects[0]?.text).toBeTruthy();
  });
});

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(signature));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
