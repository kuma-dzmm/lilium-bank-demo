export interface UserSession {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  oidcAccessToken?: string;
  oidcRefreshToken?: string | null;
}

export const SESSION_COOKIE_NAME = "bank_demo_session";
export const DEPOSIT_COOKIE_NAME = "bank_demo_pending_deposit";

export interface PendingDepositSession {
  intentId: string;
  amount: string;
  mode?: "charge" | "reserve";
}

function encodeJsonCookie(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeJsonCookie<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function encodeSessionCookie(session: UserSession): string {
  return encodeJsonCookie(session);
}

export function decodeSessionCookie(value: string | undefined): UserSession | null {
  return decodeJsonCookie<UserSession>(value);
}

export function encodePendingDepositCookie(
  pendingDeposit: PendingDepositSession,
): string {
  return encodeJsonCookie(pendingDeposit);
}

export function decodePendingDepositCookie(
  value: string | undefined,
): PendingDepositSession | null {
  return decodeJsonCookie<PendingDepositSession>(value);
}
