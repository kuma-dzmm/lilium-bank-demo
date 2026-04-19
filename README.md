# bank_demo

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
- Withdraw flow from a demo-owned treasury account to end users
- Lazy daily interest accrual at `0.1%` per day

## Local Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the Lilium OIDC client credentials
3. Fill in the Lilium webhook secret
4. Fill in `TREASURY_BEARER_TOKEN` with a manually provisioned treasury-side bearer token used for payouts in this demo
5. Run `npm install`
6. Run `npm test`
7. Run `npm run typecheck`
8. Run `npm run dev`

## Current Implementation Notes

- `src/lilium-client.ts` is the only module that talks to Lilium HTTP endpoints
- demo account state is stored per user in `AccountDurableObject`
- deposit crediting is idempotent on Lilium payment intent ID
- interest is lazily settled when the user withdraws or otherwise refreshes account state

## Limitations

- Treasury payouts currently rely on a manually supplied bearer token rather than a polished operator login/bootstrap flow
- Webhook verification currently uses a shared secret header check suitable for demo integration, not a production-grade signature scheme
- The Worker test suite currently runs against the latest locally supported compatibility runtime, which may lag the calendar date in Cloudflare's platform releases
