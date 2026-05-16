const API_VERSION = "lilium.external-command.v1";
const SIGNATURE_LABEL = "lilium";
const SIGNATURE_VALIDITY_SKEW_SECONDS = 30;
const REQUIRED_SIGNATURE_COMPONENTS = [
  "@method",
  "@authority",
  "@path",
  "content-type",
  "accept",
  "idempotency-key",
  "content-digest",
] as const;

export interface ExternalCommandInvoke {
  invocationId: string;
  senderId: string;
  args: string;
}

interface RawInvokeEnvelope {
  api_version?: unknown;
  type?: unknown;
  invocation_id?: unknown;
  command?: {
    config_id?: unknown;
    args?: unknown;
  };
  sender?: {
    id?: unknown;
  };
}

interface SignatureInput {
  components: string[];
  created: number;
  expires: number;
  keyid: string;
  alg: string;
}

export async function readExternalCommandInvoke(
  request: Request,
  sharedSecret: string,
  expectedConfigId: string,
): Promise<
  | { ok: true; invoke: ExternalCommandInvoke }
  | { ok: false; status: 400 | 401; message: string }
> {
  const body = new Uint8Array(await request.arrayBuffer());
  const signatureResult = await verifyRequestSignature(
    request,
    body,
    sharedSecret,
    expectedConfigId,
  );
  if (!signatureResult.ok) {
    return signatureResult;
  }

  let raw: RawInvokeEnvelope;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as RawInvokeEnvelope;
  } catch {
    return { ok: false, status: 400, message: "request body is not valid json" };
  }

  if (raw.api_version !== API_VERSION || raw.type !== "command.invoke") {
    return { ok: false, status: 400, message: "unsupported invoke envelope" };
  }
  if (typeof raw.invocation_id !== "string" || !raw.invocation_id) {
    return { ok: false, status: 400, message: "missing invocation_id" };
  }
  if (!raw.command || raw.command.config_id !== expectedConfigId) {
    return { ok: false, status: 400, message: "command config_id mismatch" };
  }
  if (typeof raw.command.args !== "string") {
    return { ok: false, status: 400, message: "command args must be a string" };
  }
  if (!raw.sender || typeof raw.sender.id !== "string" || !raw.sender.id) {
    return { ok: false, status: 400, message: "missing sender id" };
  }

  return {
    ok: true,
    invoke: {
      invocationId: raw.invocation_id,
      senderId: raw.sender.id,
      args: raw.command.args,
    },
  };
}

export function externalCommandResult(
  invocationId: string,
  status: "ok" | "rejected",
  text: string,
): Response {
  return Response.json(
    {
      api_version: API_VERSION,
      type: "command.result",
      invocation_id: invocationId,
      status,
      effects: [
        {
          type: "reply",
          text,
          markdown: false,
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function verifyRequestSignature(
  request: Request,
  body: Uint8Array,
  sharedSecret: string,
  expectedConfigId: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 401; message: string }> {
  const digestHeader = request.headers.get("content-digest");
  if (!digestHeader) {
    return { ok: false, status: 400, message: "missing content-digest" };
  }
  const expectedDigest = `sha-256=:${await sha256Base64(body)}:`;
  if (
    !constantTimeEqual(
      base64DigestValue(digestHeader),
      base64DigestValue(expectedDigest),
    )
  ) {
    return { ok: false, status: 400, message: "content digest mismatch" };
  }

  const signatureInputHeader = request.headers.get("signature-input");
  const signatureHeader = request.headers.get("signature");
  if (!signatureInputHeader || !signatureHeader) {
    return { ok: false, status: 401, message: "missing signature headers" };
  }

  const signatureInput = parseSignatureInput(signatureInputHeader);
  if (!signatureInput) {
    return { ok: false, status: 401, message: "invalid signature-input" };
  }
  if (
    !sameComponents(signatureInput.components, [
      ...REQUIRED_SIGNATURE_COMPONENTS,
    ])
  ) {
    return { ok: false, status: 401, message: "unsupported signature components" };
  }
  if (
    signatureInput.keyid !== expectedConfigId ||
    signatureInput.alg !== "hmac-sha256"
  ) {
    return { ok: false, status: 401, message: "unsupported signature parameters" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    signatureInput.expires < nowSeconds ||
    signatureInput.created > nowSeconds + SIGNATURE_VALIDITY_SKEW_SECONDS
  ) {
    return {
      ok: false,
      status: 401,
      message: "signature timestamp is outside the allowed window",
    };
  }

  for (const component of REQUIRED_SIGNATURE_COMPONENTS) {
    if (!component.startsWith("@") && !request.headers.has(component)) {
      return { ok: false, status: 401, message: `missing signed header ${component}` };
    }
  }

  const providedSignature = parseSignature(signatureHeader);
  if (!providedSignature) {
    return { ok: false, status: 401, message: "invalid signature" };
  }

  const expectedSignature = await hmacSha256(
    sharedSecret,
    buildSignatureBase(
      request,
      signatureInputHeader,
      signatureInput.components,
    ),
  );
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return { ok: false, status: 401, message: "signature mismatch" };
  }

  return { ok: true };
}

function buildSignatureBase(
  request: Request,
  signatureInputHeader: string,
  components: string[],
): Uint8Array {
  const parsedUrl = new URL(request.url);
  const lines = components.map((component) => {
    if (component === "@method") {
      return `"@method": ${request.method}`;
    }
    if (component === "@authority") {
      return `"@authority": ${parsedUrl.host}`;
    }
    if (component === "@path") {
      return `"@path": ${parsedUrl.pathname}${parsedUrl.search}`;
    }
    return `"${component}": ${request.headers.get(component) ?? ""}`;
  });
  lines.push(
    `"@signature-params": ${signatureInputHeader.slice(
      `${SIGNATURE_LABEL}=`.length,
    )}`,
  );
  return new TextEncoder().encode(lines.join("\n"));
}

function parseSignatureInput(value: string): SignatureInput | null {
  const match = /^lilium=\((?<components>(?:"[^"]+"\s*)+)\);(?<params>.+)$/.exec(value);
  if (!match?.groups) {
    return null;
  }

  const components = [...match.groups.components.matchAll(/"([^"]+)"/g)].map(
    (componentMatch) => componentMatch[1],
  );
  const params = parseParams(match.groups.params);
  const created = Number(params.get("created"));
  const expires = Number(params.get("expires"));
  const keyid = unquote(params.get("keyid"));
  const alg = unquote(params.get("alg"));
  if (
    !Number.isInteger(created) ||
    !Number.isInteger(expires) ||
    keyid === null ||
    alg === null
  ) {
    return null;
  }

  return {
    components,
    created,
    expires,
    keyid,
    alg,
  };
}

function parseParams(value: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of value.split(";")) {
    const [key, ...rest] = part.split("=");
    if (key && rest.length > 0) {
      params.set(key.trim(), rest.join("=").trim());
    }
  }
  return params;
}

function parseSignature(value: string): Uint8Array | null {
  const match = /^lilium=:(?<signature>[A-Za-z0-9+/=]+):$/.exec(value);
  if (!match?.groups) {
    return null;
  }
  try {
    return base64ToBytes(match.groups.signature);
  } catch {
    return null;
  }
}

function unquote(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = /^"([^"]*)"$/.exec(value);
  return match ? match[1] : null;
}

function sameComponents(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function base64DigestValue(value: string): Uint8Array {
  const match = /^sha-256=:(?<digest>[A-Za-z0-9+/=]+):$/.exec(value);
  if (!match?.groups) {
    return new Uint8Array();
  }
  return base64ToBytes(match.groups.digest);
}

async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToBase64(new Uint8Array(digest));
}

async function hmacSha256(secret: string, payload: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(payload));
  return new Uint8Array(signature);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
