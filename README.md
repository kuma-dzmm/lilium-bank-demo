# bank_demo

Live demo at https://bank.kuma.homes

Third-party demo banking application for the Lilium platform.

This repository is intentionally written from the perspective of an external
integrator. It treats Lilium as a public platform dependency and follows the
published docs in `../lilium-openapi/` for naming, routing, auth, and data
contracts.

Current status:

- Prototype implementation in progress
- Planning docs live under `docs/plans/`
- Worker code lives under `src/`

Planned capabilities:

- OIDC login with Lilium
- Deposit flow via Lilium payment intents and hosted checkout
- Withdraw flow via Lilium clearing payout
- Daily scheduled internal interest accrual at `0.1%` per day
- Lilium Bot stateless external command `/bank` for querying the sender's
  bank_demo internal balance

## Local Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the Lilium OIDC client credentials
3. Fill in the Lilium webhook and external command secrets
4. Run `npm install`
5. Run `npm test`
6. Run `npm run typecheck`
7. Run `npm run dev`

## Lilium Bot External Command

`POST /bank` implements `lilium.external-command.v1` stateless command handling.
It validates `Content-Digest` and RFC 9421 HMAC request signatures before reading
the sender's `AccountDurableObject` balance.

Example local bot config:

```yaml
external_commands:
  bank:
    name: /bank
    description: 查询莉莉银行余额
    help_text: |
      ## /bank

      **用法**
      - `/bank`

      查询你在 bank_demo 的莉莉银行内部余额。
    aliases: []
    hidden: false
    admin_only: false
    group: 外部命令
    room_types: null
    llm_note: |
      外部无状态莉莉银行命令。只能查询触发命令用户自己的 bank_demo 内部余额。
    acl_denied_message: null
    acl_denied_invite: null
    subcommands: []

    external:
      mode: stateless
      endpoint: https://bank.kuma.homes/bank
      timeout_ms: 30000
      shared_secret: "replace-with-the-same-secret-used-by-worker"
```

## Current Implementation Notes

- `src/lilium-client.ts` is the only module that talks to Lilium HTTP endpoints
- demo account state is stored per user in `AccountDurableObject`
- account enumeration for scheduled accrual is tracked in `AccountRegistryDurableObject`
- deposit crediting is idempotent on Lilium payment intent ID
- interest is accrued internally by a daily Worker cron
- withdraw uses Lilium clearing `payout`, not direct wallet transfer
- `/bank` ignores command arguments and only uses `sender.id` from the signed
  Lilium external command envelope

## Limitations

- Webhook verification uses the current Lilium HMAC signature scheme, but the demo still keeps the rest of the integration deliberately minimal
- The Worker test suite currently runs against the latest locally supported compatibility runtime, which may lag the calendar date in Cloudflare's platform releases
