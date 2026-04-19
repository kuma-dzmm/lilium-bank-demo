export interface EnvConfig {
  baseUrl: string;
  liliumBaseUrl: string;
  oidcClientId: string;
  oidcClientSecret: string;
  webhookSecret: string;
  treasuryBearerToken: string;
}

export function readConfig(
  env: Record<string, string | undefined>,
): EnvConfig {
  return {
    baseUrl: env.BASE_URL ?? "http://localhost",
    liliumBaseUrl: env.LILIUM_BASE_URL ?? "https://lilium.kuma.homes",
    oidcClientId: env.LILIUM_CLIENT_ID ?? "",
    oidcClientSecret: env.LILIUM_CLIENT_SECRET ?? "",
    webhookSecret: env.LILIUM_WEBHOOK_SECRET ?? "",
    treasuryBearerToken: env.TREASURY_BEARER_TOKEN ?? "",
  };
}
