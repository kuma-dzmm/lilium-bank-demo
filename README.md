# bank_demo

Third-party demo banking application for the Lilium platform.

This repository is intentionally written from the perspective of an external
integrator. It treats Lilium as a public platform dependency and follows the
published docs in `../lilium-openapi/` for naming, routing, auth, and data
contracts.

Current status:

- Design stage
- No production implementation yet
- Planning docs live under `docs/plans/`

Planned capabilities:

- OIDC login with Lilium
- Deposit flow via Lilium payment intents and hosted checkout
- Withdraw flow from a demo-owned treasury account to end users
- Lazy daily interest accrual at `0.1%` per day
