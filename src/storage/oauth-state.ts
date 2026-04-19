export interface OAuthStateRecord {
  state: string;
  nonce: string;
  redirectUri: string;
}

export const OAUTH_STATE_COOKIE_NAME = "bank_demo_oauth_state";

export function encodeOAuthState(record: OAuthStateRecord): string {
  return btoa(JSON.stringify(record));
}

export function decodeOAuthState(
  value: string | undefined,
): OAuthStateRecord | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(atob(value)) as OAuthStateRecord;
  } catch {
    return null;
  }
}
