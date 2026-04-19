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

## Local Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the Lilium OIDC client credentials
3. Fill in the Lilium webhook secret
4. Run `npm install`
5. Run `npm test`
6. Run `npm run typecheck`
7. Run `npm run dev`

## Current Implementation Notes

- `src/lilium-client.ts` is the only module that talks to Lilium HTTP endpoints
- demo account state is stored per user in `AccountDurableObject`
- account enumeration for scheduled accrual is tracked in `AccountRegistryDurableObject`
- deposit crediting is idempotent on Lilium payment intent ID
- interest is accrued internally by a daily Worker cron
- withdraw uses Lilium clearing `payout`, not direct wallet transfer

## Limitations

- Webhook verification uses the current Lilium HMAC signature scheme, but the demo still keeps the rest of the integration deliberately minimal
- The Worker test suite currently runs against the latest locally supported compatibility runtime, which may lag the calendar date in Cloudflare's platform releases
