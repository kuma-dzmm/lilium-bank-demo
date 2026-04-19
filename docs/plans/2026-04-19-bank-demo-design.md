# Bank Demo Design

Date: 2026-04-19

## Goal

Build a fully public-facing third-party demo application that integrates with
Lilium as an external platform and demonstrates four user-visible capabilities:

- sign in with Lilium OIDC
- deposit into the demo bank account
- withdraw from the demo bank account
- receive lazy-settled daily interest at `0.1%`

The demo must be documented and implemented as an independent third-party app,
not as an internal extension of the main Lilium codebase.

## Scope

In scope:

- independent repository layout under `bank_demo/`
- public third-party terminology and external-integration assumptions
- OIDC Authorization Code login against Lilium
- Lilium payment intent integration for user-authorized deposits
- demo-owned treasury account for withdrawals and interest payouts
- demo-local banking ledger and lazy interest accrual
- minimal Worker-hosted UI and backend API in one Cloudflare Worker project

Out of scope:

- new Lilium platform endpoints or scope changes
- direct database coupling to the main repository
- cron-based interest distribution
- real-money or regulated banking semantics
- admin dashboards beyond the minimum treasury/account inspection needed for the
  demo itself

## External Platform Assumptions

This demo treats the following as the source of truth:

- `lilium-openapi/docs/lilium-platform-authentication.md`
- `lilium-openapi/docs/lilium-open-clearing-api-design.md`
- `lilium-openapi/docs/lilium-wallet-api-design.md`

Contract assumptions taken from those docs:

- `user_id` and related identity fields are opaque strings with max length
  `255`; the app must not assume UUID format
- third-party user login uses OIDC Authorization Code with server-side token
  exchange
- machine-to-machine calls use OAuth2 `client_credentials`
- user-authorized outgoing debit from the user side must use payment intent plus
  hosted checkout rather than direct background deduction
- wallet transfer remains the generic payout path for a logged-in actor

## Why This Shape

The current Lilium integration surface supports OIDC login and partner payment
intents cleanly, but does not provide a public third-party path for using an
OIDC access token as a general delegated `wallet:transfer` token. Because of
that, the demo uses two distinct money-movement paths:

- deposits: created by the demo server through Lilium payment intents, then
  confirmed by the user on Lilium hosted checkout
- withdrawals and interest payouts: executed by the demo treasury account using
  that account's own authenticated browser session

This keeps the app externally realistic without pretending that unavailable
platform delegation features already exist.

## High-Level Architecture

The demo will be a standalone Cloudflare Worker application with one deployed
service that serves both UI and HTTP API.

Core components:

- `src/index.ts`
  Hono entrypoint, routes, session wiring, HTML responses, JSON APIs
- `src/lilium-client.ts`
  External platform client for OIDC, token exchange, userinfo, payment intents,
  checkout helpers, webhook verification, and wallet transfer calls
- `src/domain/ledger.ts`
  demo-owned balance model, transaction types, lazy interest calculation rules
- `src/domain/accounts.ts`
  account bootstrap and read models
- `src/storage/*.ts`
  Durable Object or D1-backed persistence adapters
- `src/templates/*.ts`
  minimal HTML rendering for login, dashboard, deposit, withdraw, and history

Recommended persistence:

- account state and ledger writes use a Durable Object keyed by end-user
  `user_id`
- Worker KV may be used for lightweight OAuth state/session storage if needed

Reasoning:

- lazy interest accrual requires atomic "read current state -> calculate missing
  days -> append interest rows -> update balance and accrual marker"
- a per-user Durable Object keeps that sequence serialized without inventing a
  wider locking layer

## Repository Layout

Planned repository shape:

```text
bank_demo/
  README.md
  package.json
  tsconfig.json
  wrangler.toml
  docs/
    plans/
      2026-04-19-bank-demo-design.md
      2026-04-19-bank-demo-implementation-plan.md
  src/
    index.ts
    config.ts
    lilium-client.ts
    session.ts
    domain/
      accounts.ts
      ledger.ts
      interest.ts
    storage/
      account-do.ts
      oauth-state.ts
    templates/
      layout.ts
      home.ts
      login.ts
      dashboard.ts
```

## Identity Model

There are three actor types in the app:

### 1. End user

The user who signs in with Lilium OIDC.

Stored fields:

- `user_id`
- `display_name`
- `avatar_url`
- demo session metadata

This actor owns a demo bank account ledger.

### 2. Demo partner client

The app's partner credentials used for:

- OIDC authorization code exchange
- payment intent creation
- payment intent status queries
- webhook verification and replay-safe status sync

This actor uses machine tokens and never directly impersonates users.

In the first version, the partner client is owned by the same Lilium account as
the demo treasury account so that clearing deposits and treasury payouts stay
aligned to one public-facing account boundary.

### 3. Demo treasury account

A normal Lilium user account owned by the demo operator.

This treasury account is the counterparty for:

- receiving deposits through hosted checkout
- sending withdrawals to end users
- sending interest payouts to end users

It must remain a normal public wallet subject, not a Lilium internal system
wallet.

For v1, this account is also the `owner_user_id` behind the demo's partner
client credentials.

## Banking Ledger Model

The demo owns its own ledger. Lilium wallet balances are not treated as the demo
source of truth.

Each demo account stores:

- `user_id`
- `bank_balance`
- `last_interest_accrual_date`
- `created_at`
- `updated_at`

Each ledger row stores:

- `entry_id`
- `user_id`
- `kind`
- `amount`
- `balance_after`
- `lilium_reference_id`
- `idempotency_key`
- `metadata`
- `created_at`

Initial ledger entry kinds:

- `deposit_credit`
- `withdrawal_debit`
- `interest_credit`
- `interest_payout_failed`

Rules:

- the demo ledger is append-only
- `bank_balance` is derived operational state and must always match the latest
  appended ledger outcome
- every successful Lilium money movement should be traceable through
  `lilium_reference_id`

## Interest Model

Interest rate:

- fixed `0.1%` per day

Settlement mode:

- lazy settlement only

Lazy settlement triggers:

- open dashboard
- fetch account summary
- start deposit
- start withdrawal

Settlement algorithm:

1. Load account state in the account Durable Object
2. Determine the number of whole uncredited days between
   `last_interest_accrual_date` and today
3. If no full day elapsed, do nothing
4. For each missing day, compute interest against the balance that was valid for
   that day
5. Sum the accrued interest, round to 2 decimal places using the same outward
   amount format expected by Lilium
6. Execute one payout transfer from treasury account to the user
7. On success, append one `interest_credit` row and advance
   `last_interest_accrual_date`
8. On payout failure, append `interest_payout_failed` and keep the accrual date
   unchanged

Design choice:

- one aggregated payout per settlement event, not one payout per missed day

Reasoning:

- cleaner user history in a demo
- fewer outbound Lilium wallet transfers
- simpler recovery semantics

## Deposit Flow

Deposit must follow the public clearing model rather than direct wallet debit.

Flow:

1. User signs in to `bank_demo`
2. User enters a deposit amount
3. Worker lazily settles any pending interest first
4. Worker obtains a partner machine token from Lilium
5. Worker creates a payment intent whose target counterparty is the demo
   treasury account
6. Worker redirects the user to the hosted checkout URL returned by Lilium
7. User logs in to Lilium if needed and confirms the payment
8. Lilium redirects the browser back to the demo return URL
9. Demo verifies final state through webhook or status query
10. On confirmed success, demo appends `deposit_credit` and updates
    `bank_balance`

Important boundary:

- browser redirects are not final truth
- the demo must trust webhook or explicit intent status fetch before crediting
  its own ledger

## Withdrawal Flow

Withdrawal is a treasury-originated payout.

Flow:

1. User signs in to `bank_demo`
2. User enters a withdrawal amount
3. Worker lazily settles pending interest first
4. Worker checks demo `bank_balance`
5. If insufficient, reject before calling Lilium
6. Worker uses the treasury account's authenticated browser session to call
   Lilium wallet transfer
7. On success, append `withdrawal_debit` and update `bank_balance`
8. Persist the Lilium transfer reference for reconciliation

Important boundary:

- this is intentionally not modeled as payment intent because the payer is the
  demo treasury, not the end user

## Session Strategy

The demo will need two separate session contexts:

### User session

For the currently logged-in end user:

- demo cookie session
- OIDC refresh token storage
- latest cached profile fields

### Treasury operator session

For the treasury account used to send payouts:

- separate authenticated browser cookie jar or session token material
- stored outside the end-user session
- never mixed with the machine-token client credentials path

For demo simplicity, the first version may assume treasury session bootstrap is
performed manually by the operator and then stored as an encrypted Worker
secret/session blob.

## Webhook Strategy

The demo should support Lilium webhook callbacks for payment intent lifecycle
events.

Required behavior:

- verify webhook authenticity using the configured webhook secret
- treat webhook delivery as replayable
- use intent ID plus event type idempotency protection
- allow webhook delivery to finalize deposits even if the user never returns to
  the demo page

Fallback:

- return flow may also poll the payment intent state for a short bounded window
  to reduce user confusion

## Minimal UI Surface

The demo UI should stay intentionally small and external-facing.

Pages:

- home page with Lilium sign-in
- dashboard with current demo bank balance and latest Lilium identity info
- deposit form
- withdrawal form
- recent ledger history

Visible fields:

- `display_name`
- `user_id`
- demo bank balance
- last settled interest date
- most recent bank ledger entries

The page should explain that this is a demo bank layered on top of the Lilium
game wallet system and that all balances shown here are the demo's own ledger,
not the user's total Lilium wallet balance.

## Security Requirements

- do not assume any `user_id` format
- keep OIDC refresh tokens encrypted at rest
- keep partner client secret in Worker secrets only
- keep treasury session material isolated from user sessions
- reject any deposit or withdrawal amount not representable as a positive
  decimal string with at most 2 decimal places
- apply idempotency keys to all write operations that call Lilium
- never credit the demo ledger on redirect alone without verifying final Lilium
  state

## Risks And Mitigations

### Treasury session fragility

Risk:

- withdrawal and interest payouts rely on the treasury account's authenticated
  browser session

Mitigation:

- make treasury-session status visible in the app
- fail closed when treasury auth is missing
- keep the first implementation explicit and operator-managed rather than trying
  to auto-refresh an unsupported session model

### Duplicate deposit credit

Risk:

- user returns to the site and webhook also arrives

Mitigation:

- deposit finalization must be keyed by payment intent ID and remain idempotent

### Interest double-settlement

Risk:

- two concurrent requests settle the same account at once

Mitigation:

- per-user Durable Object serialization for all account mutations

## Open Questions Resolved

- repo boundary: independent public third-party app under its own git repo
- naming: use `lilium-client.ts`, not internal project names
- deposits: use payment intent plus hosted checkout
- withdrawals and interest: use demo treasury account payouts
- interest mode: lazy settlement, not scheduled distribution

## Implementation Readiness

This spec is ready for implementation planning once reviewed.

The next document should be:

- `docs/plans/2026-04-19-bank-demo-implementation-plan.md`

That plan should decompose the work into:

- repo bootstrap
- OIDC integration
- Lilium client wrapper
- durable storage and ledger
- deposit finalization
- withdrawal flow
- lazy interest settlement
- minimal UI
- tests and verification
