export interface LiliumClientConfig {
  baseUrl: string;
}

export interface AuthorizeUrlInput {
  redirectUri: string;
  clientId: string;
  state: string;
  nonce: string;
}

export interface AuthorizationCodeTokenInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface RefreshTokenInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface ClientCredentialsInput {
  clientId: string;
  clientSecret: string;
}

export interface OidcTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface UserInfoResponse {
  sub: string;
  display_name?: string;
  avatar_url?: string | null;
}

export interface WalletBalanceResponse {
  user_id: string;
  balance: string;
}

export interface CreatePaymentIntentInput {
  userId: string;
  amount: string;
  operation?: "charge" | "reserve";
  partnerReferenceId: string;
  returnUrl: string;
  cancelUrl: string;
  title: string;
  summary: string;
  accountCode?: string;
  expiresInSeconds?: number;
}

export interface CreatePaymentIntentResponse {
  intent_id: string;
  status: string;
  operation?: string;
  amount?: string;
  user_id?: string;
  checkout_url: string;
  expires_at: string;
}

export interface TransferFromTreasuryInput {
  toUserId: string;
  amount: string;
  memo: string;
}

export interface TransferFromTreasuryResponse {
  from_user_id: string;
  to_user_id: string;
  amount: string;
  from_balance: string;
  reference_id: string;
  created_at: string;
}

export interface CreatePayoutInstructionInput {
  userId: string;
  amount: string;
  partnerReferenceId: string;
  note?: string;
}

export interface CreatePayoutInstructionResponse {
  instruction_id: string;
  status: string;
  operation: string;
  account_code: string;
  amount: string;
  user_id: string;
  partner_reference_id?: string;
  created_at: string;
}

export interface CreateCommitInstructionInput {
  userId: string;
  intentId: string;
  amount: string;
  partnerReferenceId: string;
  note?: string;
}

export interface CreateCommitInstructionResponse {
  instruction_id: string;
  status: string;
  operation: string;
  account_code: string;
  amount: string;
  user_id: string;
  partner_reference_id?: string;
  created_at: string;
}

type FetchImpl = typeof fetch;

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`lilium_http_${response.status}:${detail}`);
  }

  return (await response.json()) as T;
}

export class LiliumClient {
  constructor(
    private readonly config: LiliumClientConfig,
    private readonly fetchImpl: FetchImpl,
  ) {}

  buildAuthorizeUrl(input: AuthorizeUrlInput): string {
    const url = new URL("/oauth/authorize", this.config.baseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", "openid profile wallet:read");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    return url.toString();
  }

  async exchangeAuthorizationCode(
    input: AuthorizationCodeTokenInput,
  ): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
    });

    const response = await this.fetchImpl(
      new URL("/oauth/token", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    return parseJsonResponse<OidcTokenResponse>(response);
  }

  async refreshOidcSession(input: RefreshTokenInput): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
    });

    const response = await this.fetchImpl(
      new URL("/oauth/token", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    return parseJsonResponse<OidcTokenResponse>(response);
  }

  async issueMachineToken(
    input: ClientCredentialsInput,
  ): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });

    const response = await this.fetchImpl(
      new URL("/oauth/token", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    return parseJsonResponse<OidcTokenResponse>(response);
  }

  async getUserInfo(accessToken: string): Promise<UserInfoResponse> {
    const response = await this.fetchImpl(
      new URL("/userinfo", this.config.baseUrl).toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return parseJsonResponse<UserInfoResponse>(response);
  }

  async getWalletBalance(accessToken: string): Promise<WalletBalanceResponse> {
    const response = await this.fetchImpl(
      new URL("/api/wallet/balance", this.config.baseUrl).toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return parseJsonResponse<WalletBalanceResponse>(response);
  }

  async createPaymentIntent(
    accessToken: string,
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResponse> {
    const response = await this.fetchImpl(
      new URL("/api/v1/payment-intents", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.partnerReferenceId,
        },
        body: JSON.stringify({
          user_id: input.userId,
          operation: input.operation ?? "charge",
          account_code: input.accountCode,
          amount: input.amount,
          asset_code: "dollars",
          title: input.title,
          summary: input.summary,
          partner_reference_id: input.partnerReferenceId,
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          expires_in_seconds: input.expiresInSeconds ?? 900,
        }),
      },
    );

    return parseJsonResponse<CreatePaymentIntentResponse>(response);
  }

  async getPaymentIntent(
    accessToken: string,
    intentId: string,
  ): Promise<CreatePaymentIntentResponse> {
    const response = await this.fetchImpl(
      new URL(`/api/v1/payment-intents/${intentId}`, this.config.baseUrl).toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return parseJsonResponse<CreatePaymentIntentResponse>(response);
  }

  async createPayoutInstruction(
    accessToken: string,
    input: CreatePayoutInstructionInput,
  ): Promise<CreatePayoutInstructionResponse> {
    const response = await this.fetchImpl(
      new URL("/api/v1/clearing-instructions", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.partnerReferenceId,
        },
        body: JSON.stringify({
          operation: "payout",
          user_id: input.userId,
          amount: input.amount,
          asset_code: "dollars",
          partner_reference_id: input.partnerReferenceId,
          note: input.note,
        }),
      },
    );

    return parseJsonResponse<CreatePayoutInstructionResponse>(response);
  }

  async createCommitInstruction(
    accessToken: string,
    input: CreateCommitInstructionInput,
  ): Promise<CreateCommitInstructionResponse> {
    const response = await this.fetchImpl(
      new URL("/api/v1/clearing-instructions", this.config.baseUrl).toString(),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.partnerReferenceId,
        },
        body: JSON.stringify({
          operation: "commit",
          user_id: input.userId,
          intent_id: input.intentId,
          amount: input.amount,
          asset_code: "dollars",
          partner_reference_id: input.partnerReferenceId,
          note: input.note,
        }),
      },
    );

    return parseJsonResponse<CreateCommitInstructionResponse>(response);
  }
}
