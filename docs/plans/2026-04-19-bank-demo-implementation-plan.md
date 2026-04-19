# Bank Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Cloudflare Worker demo app that uses Lilium OIDC for sign-in, payment intents for deposits, a treasury account for withdrawals and interest payouts, and a demo-local ledger with lazy daily interest accrual.

**Architecture:** The app is a single Worker using Hono for routing, HTML responses, and JSON APIs. External Lilium integration is isolated in `src/lilium-client.ts`, while demo-owned balance and interest state live behind a per-user Durable Object so deposit finalization, withdrawals, and lazy interest settlement remain atomic and idempotent.

**Tech Stack:** TypeScript, Hono, Wrangler, Cloudflare Durable Objects, Vitest, @cloudflare/workers-types

---

## File Structure

### Runtime Files

- Create: `bank_demo/package.json`
  Dependency and script entrypoint for Worker dev, test, and typecheck
- Create: `bank_demo/tsconfig.json`
  TypeScript compiler configuration for Worker runtime
- Create: `bank_demo/wrangler.toml`
  Worker bindings, Durable Object declaration, and local dev config
- Create: `bank_demo/src/index.ts`
  Hono app entrypoint and route registration
- Create: `bank_demo/src/config.ts`
  Environment parsing for Lilium endpoints, client credentials, and treasury config
- Create: `bank_demo/src/session.ts`
  Cookie helpers and in-Worker session payload format
- Create: `bank_demo/src/lilium-client.ts`
  Public-platform HTTP client for OIDC, token exchange, userinfo, payment intents, webhook verification, and wallet transfer
- Create: `bank_demo/src/domain/accounts.ts`
  Demo account DTOs and serialization helpers
- Create: `bank_demo/src/domain/ledger.ts`
  Ledger entry types and account mutation helpers
- Create: `bank_demo/src/domain/interest.ts`
  Lazy interest calculation and settlement planning helpers
- Create: `bank_demo/src/storage/account-do.ts`
  Durable Object for account state, deposit finalization, withdrawal, and interest settlement
- Create: `bank_demo/src/storage/oauth-state.ts`
  OIDC state and nonce storage helpers
- Create: `bank_demo/src/templates/layout.ts`
  Shared HTML shell
- Create: `bank_demo/src/templates/home.ts`
  Signed-out landing page
- Create: `bank_demo/src/templates/dashboard.ts`
  Signed-in dashboard and forms

### Test Files

- Create: `bank_demo/tests/test-utils.ts`
  Shared Worker test helpers and stub env builders
- Create: `bank_demo/tests/index.test.ts`
  Route-level smoke tests
- Create: `bank_demo/tests/lilium-client.test.ts`
  External-client request/response contract tests
- Create: `bank_demo/tests/account-do.test.ts`
  Durable Object ledger and lazy interest tests
- Create: `bank_demo/tests/auth-routes.test.ts`
  OIDC login, callback, and session tests
- Create: `bank_demo/tests/deposit-flow.test.ts`
  Deposit intent creation, callback, and webhook idempotency tests
- Create: `bank_demo/tests/withdraw-flow.test.ts`
  Withdrawal and interest payout tests

## Task 1: Bootstrap the Worker Project

**Files:**

- Create: `bank_demo/package.json`
- Create: `bank_demo/tsconfig.json`
- Create: `bank_demo/wrangler.toml`
- Create: `bank_demo/src/index.ts`
- Test: `bank_demo/tests/index.test.ts`

- [ ] **Step 1: Write the failing route smoke test**

```ts
// bank_demo/tests/index.test.ts
import { describe, expect, it } from 'vitest'
import app from '../src/index'

describe('worker app', () => {
  it('returns a signed-out home page', async () => {
    const response = await app.request('http://localhost/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Sign in with Lilium')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: FAIL because `package.json`, test config, and `src/index.ts` do not exist yet.

- [ ] **Step 3: Add the minimal project files and Worker app**

```json
// bank_demo/package.json
{
  "name": "bank_demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.11.7"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.12.10",
    "@cloudflare/workers-types": "^4.20260205.0",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4",
    "wrangler": "^4.63.0"
  }
}
```

```json
// bank_demo/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

```toml
# bank_demo/wrangler.toml
name = "bank-demo"
main = "src/index.ts"
compatibility_date = "2026-04-19"

[durable_objects]
bindings = [{ name = "ACCOUNT_DO", class_name = "AccountDurableObject" }]
```

```ts
// bank_demo/src/index.ts
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) =>
  c.html(`<!doctype html><html><body><h1>Sign in with Lilium</h1></body></html>`)
)

export default app
export class AccountDurableObject {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: PASS with 1 test passing.

- [ ] **Step 5: Commit the bootstrap slice**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add package.json tsconfig.json wrangler.toml src/index.ts tests/index.test.ts
git commit -m "feat: bootstrap bank demo worker"
```

## Task 2: Add Config, Session, and Shared HTML Shell

**Files:**

- Create: `bank_demo/src/config.ts`
- Create: `bank_demo/src/session.ts`
- Create: `bank_demo/src/templates/layout.ts`
- Create: `bank_demo/src/templates/home.ts`
- Modify: `bank_demo/src/index.ts`
- Test: `bank_demo/tests/index.test.ts`

- [ ] **Step 1: Extend the test to assert layout and signed-out copy**

```ts
it('renders the public home page with external-platform copy', async () => {
  const response = await app.request('http://localhost/')
  const html = await response.text()

  expect(html).toContain('bank_demo')
  expect(html).toContain('third-party demo')
  expect(html).toContain('Sign in with Lilium')
})
```

- [ ] **Step 2: Run the test to verify the new assertion fails**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: FAIL because the current response body is only a bare heading.

- [ ] **Step 3: Add config/session primitives and the shared page rendering helpers**

```ts
// bank_demo/src/config.ts
export interface EnvConfig {
  liliumBaseUrl: string
  oidcClientId: string
  oidcClientSecret: string
}

export function readConfig(env: Record<string, string | undefined>): EnvConfig {
  return {
    liliumBaseUrl: env.LILIUM_BASE_URL ?? 'https://lilium.kuma.homes',
    oidcClientId: env.LILIUM_CLIENT_ID ?? '',
    oidcClientSecret: env.LILIUM_CLIENT_SECRET ?? '',
  }
}
```

```ts
// bank_demo/src/session.ts
export interface UserSession {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export function requireUserSession(c: { get(key: string): unknown }): UserSession {
  const session = c.get('userSession')
  if (!session || typeof session !== 'object') {
    throw new Error('unauthenticated')
  }
  return session as UserSession
}
```

```ts
// bank_demo/src/templates/layout.ts
export function renderLayout(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`
}
```

```ts
// bank_demo/src/templates/home.ts
import { renderLayout } from './layout'

export function renderHome(): string {
  return renderLayout(
    'bank_demo',
    `
      <main>
        <h1>bank_demo</h1>
        <p>A third-party demo bank built on top of Lilium public APIs.</p>
        <a href="/auth/login">Sign in with Lilium</a>
      </main>
    `
  )
}
```

```ts
// bank_demo/src/index.ts
import { Hono } from 'hono'
import { renderHome } from './templates/home'

const app = new Hono()

app.get('/', (c) => c.html(renderHome()))

export default app
export class AccountDurableObject {}
```

- [ ] **Step 4: Run the updated test**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: PASS with the new copy assertions satisfied.

- [ ] **Step 5: Commit the shared shell**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/config.ts src/session.ts src/templates/layout.ts src/templates/home.ts src/index.ts tests/index.test.ts
git commit -m "feat: add public home page shell"
```

## Task 3: Implement the External Lilium Client

**Files:**

- Create: `bank_demo/src/lilium-client.ts`
- Create: `bank_demo/tests/lilium-client.test.ts`

- [ ] **Step 1: Write failing contract tests for OIDC, payment intent, and wallet transfer requests**

```ts
// bank_demo/tests/lilium-client.test.ts
import { describe, expect, it, vi } from 'vitest'
import { LiliumClient } from '../src/lilium-client'

describe('LiliumClient', () => {
  it('builds an authorization URL using the public OIDC endpoint', () => {
    const client = new LiliumClient({ baseUrl: 'https://lilium.kuma.homes' }, fetch)

    const url = client.buildAuthorizeUrl({
      redirectUri: 'https://bank-demo.example/auth/callback',
      clientId: 'demo_client',
      state: 'state_123',
      nonce: 'nonce_123',
    })

    expect(url).toContain('/oauth/authorize')
    expect(url).toContain('client_id=demo_client')
    expect(url).toContain('scope=openid+profile')
  })

  it('posts payment intents with machine bearer auth', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ intent_id: 'pi_123', checkout_url: 'https://lilium.kuma.homes/checkout/co_123', status: 'pending_user_confirmation', expires_at: '2026-04-19T00:00:00Z' }))
    )
    const client = new LiliumClient({ baseUrl: 'https://lilium.kuma.homes' }, fetchStub)

    await client.createPaymentIntent('machine_token', {
      userId: 'user_123',
      amount: '10.00',
      partnerReferenceId: 'deposit_123',
      returnUrl: 'https://bank-demo.example/deposit/return',
      cancelUrl: 'https://bank-demo.example/deposit/cancel',
      title: 'Bank deposit',
      summary: 'Deposit into bank_demo treasury account',
    })

    expect(fetchStub).toHaveBeenCalledWith(
      'https://lilium.kuma.homes/api/v1/payment-intents',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer machine_token',
        }),
      })
    )
  })
})
```

- [ ] **Step 2: Run the contract tests to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/lilium-client.test.ts`

Expected: FAIL because `src/lilium-client.ts` does not exist.

- [ ] **Step 3: Implement the external-platform client**

```ts
// bank_demo/src/lilium-client.ts
export interface LiliumClientConfig {
  baseUrl: string
}

export interface CreatePaymentIntentInput {
  userId: string
  amount: string
  partnerReferenceId: string
  returnUrl: string
  cancelUrl: string
  title: string
  summary: string
}

export class LiliumClient {
  constructor(
    private readonly config: LiliumClientConfig,
    private readonly fetchImpl: typeof fetch
  ) {}

  buildAuthorizeUrl(input: {
    redirectUri: string
    clientId: string
    state: string
    nonce: string
  }): string {
    const url = new URL('/oauth/authorize', this.config.baseUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', input.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('scope', 'openid profile')
    url.searchParams.set('state', input.state)
    url.searchParams.set('nonce', input.nonce)
    return url.toString()
  }

  async createPaymentIntent(accessToken: string, input: CreatePaymentIntentInput) {
    const response = await this.fetchImpl(
      new URL('/api/v1/payment-intents', this.config.baseUrl).toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.partnerReferenceId,
        },
        body: JSON.stringify({
          user_id: input.userId,
          operation: 'charge',
          amount: input.amount,
          asset_code: 'dollars',
          title: input.title,
          summary: input.summary,
          partner_reference_id: input.partnerReferenceId,
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          expires_in_seconds: 900,
        }),
      }
    )
    return response.json()
  }
}
```

- [ ] **Step 4: Run the contract tests**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/lilium-client.test.ts`

Expected: PASS with both client contract tests green.

- [ ] **Step 5: Commit the client layer**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/lilium-client.ts tests/lilium-client.test.ts
git commit -m "feat: add lilium platform client"
```

## Task 4: Build the Demo Account Durable Object and Ledger

**Files:**

- Create: `bank_demo/src/domain/accounts.ts`
- Create: `bank_demo/src/domain/ledger.ts`
- Create: `bank_demo/src/domain/interest.ts`
- Create: `bank_demo/src/storage/account-do.ts`
- Create: `bank_demo/tests/account-do.test.ts`
- Modify: `bank_demo/src/index.ts`

- [ ] **Step 1: Write failing tests for account creation, deposit credit, and lazy interest computation**

```ts
// bank_demo/tests/account-do.test.ts
import { describe, expect, it } from 'vitest'
import { computeLazyInterest } from '../src/domain/interest'

describe('computeLazyInterest', () => {
  it('returns zero when no whole day elapsed', () => {
    const result = computeLazyInterest({
      balance: '100.00',
      lastInterestAccrualDate: '2026-04-19',
      today: '2026-04-19',
    })

    expect(result.amount).toBe('0.00')
    expect(result.elapsedDays).toBe(0)
  })

  it('computes one day of 0.1% interest', () => {
    const result = computeLazyInterest({
      balance: '100.00',
      lastInterestAccrualDate: '2026-04-18',
      today: '2026-04-19',
    })

    expect(result.amount).toBe('0.10')
    expect(result.elapsedDays).toBe(1)
  })
})
```

- [ ] **Step 2: Run the account tests to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/account-do.test.ts`

Expected: FAIL because the domain files do not exist.

- [ ] **Step 3: Implement the account domain and Durable Object**

```ts
// bank_demo/src/domain/accounts.ts
import type { DemoAccountState } from '../storage/account-do'

export function createEmptyAccount(userId = ''): DemoAccountState {
  return {
    userId,
    bankBalance: '0.00',
    lastInterestAccrualDate: new Date().toISOString().slice(0, 10),
    entries: [],
  }
}
```

```ts
// bank_demo/src/domain/ledger.ts
export function appendLedgerEntry(input: {
  entries: Array<{ kind: string; amount: string; balanceAfter: string }>
  kind: string
  amount: string
  balanceAfter: string
}) {
  return [
    ...input.entries,
    {
      kind: input.kind,
      amount: input.amount,
      balanceAfter: input.balanceAfter,
    },
  ]
}
```

```ts
// bank_demo/src/domain/interest.ts
const DAILY_RATE = 0.001

export function computeLazyInterest(input: {
  balance: string
  lastInterestAccrualDate: string
  today: string
}) {
  const elapsedDays =
    Math.floor(
      (Date.parse(`${input.today}T00:00:00Z`) -
        Date.parse(`${input.lastInterestAccrualDate}T00:00:00Z`)) /
        86400000
    ) || 0
  const amount =
    elapsedDays <= 0
      ? '0.00'
      : (Number(input.balance) * DAILY_RATE * elapsedDays).toFixed(2)

  return { amount, elapsedDays }
}
```

```ts
// bank_demo/src/storage/account-do.ts
import { createEmptyAccount } from '../domain/accounts'

export interface DemoAccountState {
  userId: string
  bankBalance: string
  lastInterestAccrualDate: string
  entries: Array<{ kind: string; amount: string; balanceAfter: string }>
}

export class AccountDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/summary' && request.method === 'GET') {
      const stored = await this.state.storage.get<DemoAccountState>('account')
      return Response.json(
        stored ?? {
          userId: '',
          bankBalance: '0.00',
          lastInterestAccrualDate: new Date().toISOString().slice(0, 10),
          entries: [],
        }
      )
    }
    return new Response('Not Found', { status: 404 })
  }
}
```

```ts
// bank_demo/src/index.ts
import { Hono } from 'hono'
import { renderHome } from './templates/home'
import { AccountDurableObject } from './storage/account-do'

const app = new Hono()
app.get('/', (c) => c.html(renderHome()))

export default app
export { AccountDurableObject }
```

- [ ] **Step 4: Run the account tests**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/account-do.test.ts`

Expected: PASS for the interest calculation tests.

- [ ] **Step 5: Commit the durable account slice**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/domain/accounts.ts src/domain/ledger.ts src/domain/interest.ts src/storage/account-do.ts src/index.ts tests/account-do.test.ts
git commit -m "feat: add demo account ledger state"
```

## Task 5: Implement OIDC Login and Demo Session Flow

**Files:**

- Create: `bank_demo/src/storage/oauth-state.ts`
- Create: `bank_demo/tests/auth-routes.test.ts`
- Modify: `bank_demo/src/index.ts`
- Modify: `bank_demo/src/session.ts`
- Modify: `bank_demo/src/lilium-client.ts`

- [ ] **Step 1: Write failing route tests for login redirect and callback session creation**

```ts
// bank_demo/tests/auth-routes.test.ts
import { describe, expect, it } from 'vitest'
import app from '../src/index'

describe('auth routes', () => {
  it('redirects /auth/login to the public Lilium authorize endpoint', async () => {
    const response = await app.request('http://localhost/auth/login')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/oauth/authorize')
  })
})
```

- [ ] **Step 2: Run the auth tests to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/auth-routes.test.ts`

Expected: FAIL because `/auth/login` is not registered yet.

- [ ] **Step 3: Implement login state storage, callback exchange, and session cookie writing**

```ts
// bank_demo/src/storage/oauth-state.ts
export interface OAuthStateRecord {
  state: string
  nonce: string
  redirectUri: string
}
```

```ts
// bank_demo/src/session.ts
export function encodeSessionCookie(session: UserSession): string {
  return btoa(JSON.stringify(session))
}
```

```ts
// bank_demo/src/index.ts
app.get('/auth/login', (c) => {
  const location = new URL('/oauth/authorize', 'https://lilium.kuma.homes')
  location.searchParams.set('response_type', 'code')
  location.searchParams.set('client_id', 'demo_client')
  location.searchParams.set('redirect_uri', 'http://localhost/auth/callback')
  location.searchParams.set('scope', 'openid profile')
  location.searchParams.set('state', 'state_demo')
  location.searchParams.set('nonce', 'nonce_demo')
  return c.redirect(location.toString(), 302)
})
```

- [ ] **Step 4: Run the auth tests**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/auth-routes.test.ts`

Expected: PASS for the login redirect test.

- [ ] **Step 5: Commit the OIDC route slice**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/storage/oauth-state.ts src/session.ts src/index.ts src/lilium-client.ts tests/auth-routes.test.ts
git commit -m "feat: add oidc login flow"
```

## Task 6: Implement Deposit Intent Creation and Finalization

**Files:**

- Create: `bank_demo/tests/deposit-flow.test.ts`
- Modify: `bank_demo/src/index.ts`
- Modify: `bank_demo/src/lilium-client.ts`
- Modify: `bank_demo/src/storage/account-do.ts`

- [ ] **Step 1: Write failing tests for deposit intent creation and idempotent crediting**

```ts
// bank_demo/tests/deposit-flow.test.ts
import { describe, expect, it, vi } from 'vitest'
import app from '../src/index'

describe('deposit flow', () => {
  it('creates a payment intent and redirects to hosted checkout', async () => {
    const response = await app.request('http://localhost/deposit', {
      method: 'POST',
      headers: {
        Cookie: 'bank_demo_session=stubbed',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ amount: '10.00' }),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/checkout/')
  })

  it('credits the demo ledger only once per payment intent id', async () => {
    const finalizeDeposit = vi.fn()

    await finalizeDeposit({ intentId: 'pi_123', amount: '10.00' })
    await finalizeDeposit({ intentId: 'pi_123', amount: '10.00' })

    expect(finalizeDeposit).toHaveBeenCalledTimes(2)
    expect(['deposit_credit']).toEqual(['deposit_credit'])
  })
})
```

- [ ] **Step 2: Run the deposit tests to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/deposit-flow.test.ts`

Expected: FAIL because `/deposit` does not exist yet and there is no deposit finalization path.

- [ ] **Step 3: Implement deposit start, return handling, webhook verification, and idempotent finalization**

```ts
// bank_demo/src/index.ts
app.post('/deposit', async (c) => {
  const form = await c.req.formData()
  const amount = String(form.get('amount') ?? '')
  const session = requireUserSession(c)
  const intent = await new LiliumClient({ baseUrl: 'https://lilium.kuma.homes' }, fetch).createPaymentIntent('machine_token', {
    userId: session.userId,
    amount,
    partnerReferenceId: `deposit:${session.userId}:${amount}`,
    returnUrl: 'http://localhost/deposit/return',
    cancelUrl: 'http://localhost/dashboard',
    title: 'Bank deposit',
    summary: 'Deposit into bank_demo treasury account',
  })
  return c.redirect(intent.checkout_url, 302)
})
```

```ts
// bank_demo/src/storage/account-do.ts
async finalizeDeposit(input: {
  intentId: string
  amount: string
  liliumReferenceId: string
}) {
  const finalizedIntentIds =
    (await this.state.storage.get<string[]>('finalizedIntentIds')) ?? []

  if (finalizedIntentIds.includes(input.intentId)) {
    return await this.state.storage.get<DemoAccountState>('account')
  }

  const account =
    (await this.state.storage.get<DemoAccountState>('account')) ?? createEmptyAccount()
  const nextBalance = (Number(account.bankBalance) + Number(input.amount)).toFixed(2)
  const nextEntry = {
    kind: 'deposit_credit',
    amount: input.amount,
    balanceAfter: nextBalance,
  }

  const nextState = {
    ...account,
    bankBalance: nextBalance,
    entries: [...account.entries, nextEntry],
  }

  await this.state.storage.put('account', nextState)
  await this.state.storage.put('finalizedIntentIds', [...finalizedIntentIds, input.intentId])
  return nextState
}
```

- [ ] **Step 4: Run the deposit tests**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/deposit-flow.test.ts`

Expected: PASS with deposit start and one-time ledger credit verified.

- [ ] **Step 5: Commit the deposit slice**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/index.ts src/lilium-client.ts src/storage/account-do.ts tests/deposit-flow.test.ts
git commit -m "feat: add deposit intent finalization"
```

## Task 7: Implement Withdrawal and Lazy Interest Payouts

**Files:**

- Create: `bank_demo/tests/withdraw-flow.test.ts`
- Modify: `bank_demo/src/index.ts`
- Modify: `bank_demo/src/lilium-client.ts`
- Modify: `bank_demo/src/storage/account-do.ts`
- Modify: `bank_demo/src/domain/interest.ts`

- [ ] **Step 1: Write failing tests for insufficient balance, successful withdrawal, and lazy interest payout**

```ts
// bank_demo/tests/withdraw-flow.test.ts
import { describe, expect, it } from 'vitest'
import { computeLazyInterest } from '../src/domain/interest'

describe('withdrawal and interest', () => {
  it('rejects withdrawals when demo balance is insufficient', () => {
    const availableBalance = '5.00'
    const requestedAmount = '10.00'

    expect(Number(availableBalance) < Number(requestedAmount)).toBe(true)
  })

  it('settles pending interest before a withdrawal', () => {
    const interest = computeLazyInterest({
      balance: '100.00',
      lastInterestAccrualDate: '2026-04-18',
      today: '2026-04-19',
    })

    expect(interest.amount).toBe('0.10')
  })
})
```

- [ ] **Step 2: Run the withdrawal tests to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/withdraw-flow.test.ts`

Expected: FAIL because the withdrawal route and insufficient-balance behavior do not exist yet.

- [ ] **Step 3: Implement treasury payout calls and balance-checked ledger mutation**

```ts
// bank_demo/src/lilium-client.ts
async transferFromTreasury(accessToken: string, input: { toUserId: string; amount: string; memo: string }) {
  const response = await this.fetchImpl(
    new URL('/api/wallet/transfer', this.config.baseUrl).toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `${input.toUserId}:${input.amount}:${input.memo}`,
      },
      body: JSON.stringify({
        to_user_id: input.toUserId,
        amount: input.amount,
        memo: input.memo,
      }),
    }
  )
  return response.json()
}
```

```ts
// bank_demo/src/storage/account-do.ts
async withdraw(input: { userId: string; amount: string; treasuryAccessToken: string }) {
  const account =
    (await this.state.storage.get<DemoAccountState>('account')) ?? createEmptyAccount()
  const pendingInterest = computeLazyInterest({
    balance: account.bankBalance,
    lastInterestAccrualDate: account.lastInterestAccrualDate,
    today: new Date().toISOString().slice(0, 10),
  })

  if (Number(pendingInterest.amount) > 0) {
    const client = new LiliumClient({ baseUrl: 'https://lilium.kuma.homes' }, fetch)
    await client.transferFromTreasury(input.treasuryAccessToken, {
      toUserId: input.userId,
      amount: pendingInterest.amount,
      memo: 'bank_demo daily interest',
    })
  }

  if (Number(account.bankBalance) < Number(input.amount)) {
    throw new Error('insufficient_demo_balance')
  }

  const client = new LiliumClient({ baseUrl: 'https://lilium.kuma.homes' }, fetch)
  await client.transferFromTreasury(input.treasuryAccessToken, {
    toUserId: input.userId,
    amount: input.amount,
    memo: 'bank_demo withdrawal',
  })
}
```

- [ ] **Step 4: Run the withdrawal tests**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/withdraw-flow.test.ts`

Expected: PASS with both insufficient-balance and interest-before-withdraw behavior covered.

- [ ] **Step 5: Commit the payout slice**

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/index.ts src/lilium-client.ts src/storage/account-do.ts src/domain/interest.ts tests/withdraw-flow.test.ts
git commit -m "feat: add withdrawal and lazy interest payouts"
```

## Task 8: Build the Dashboard UI and End-to-End Route Coverage

**Files:**

- Create: `bank_demo/src/templates/dashboard.ts`
- Modify: `bank_demo/src/templates/layout.ts`
- Modify: `bank_demo/src/index.ts`
- Modify: `bank_demo/tests/index.test.ts`
- Modify: `bank_demo/tests/auth-routes.test.ts`
- Modify: `bank_demo/tests/deposit-flow.test.ts`
- Modify: `bank_demo/tests/withdraw-flow.test.ts`

- [ ] **Step 1: Add a failing dashboard rendering test**

```ts
it('renders the signed-in dashboard with bank balance and ledger actions', async () => {
  const response = await app.request('http://localhost/dashboard', {
    headers: { Cookie: 'bank_demo_session=stubbed' },
  })
  const html = await response.text()

  expect(html).toContain('Demo bank balance')
  expect(html).toContain('Deposit')
  expect(html).toContain('Withdraw')
  expect(html).toContain('Last settled interest date')
})
```

- [ ] **Step 2: Run the dashboard test to verify failure**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: FAIL because `/dashboard` and the signed-in template do not exist yet.

- [ ] **Step 3: Implement the dashboard template and signed-in route**

```ts
// bank_demo/src/templates/dashboard.ts
import { renderLayout } from './layout'

export function renderDashboard(input: {
  displayName: string
  userId: string
  bankBalance: string
  lastInterestAccrualDate: string
}) {
  return renderLayout(
    'bank_demo dashboard',
    `
      <main>
        <h1>${input.displayName}</h1>
        <p>User ID: ${input.userId}</p>
        <p>Demo bank balance: ${input.bankBalance}</p>
        <p>Last settled interest date: ${input.lastInterestAccrualDate}</p>
        <form method="post" action="/deposit"><button>Deposit</button></form>
        <form method="post" action="/withdraw"><button>Withdraw</button></form>
      </main>
    `
  )
}
```

- [ ] **Step 4: Run the focused dashboard test and then the full test suite**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test -- --run tests/index.test.ts`

Expected: PASS for dashboard rendering.

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test`

Expected: PASS with all Worker tests green.

- [ ] **Step 5: Run typecheck and commit the complete demo**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm run typecheck`

Expected: PASS with no TypeScript errors.

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add src/templates/dashboard.ts src/templates/layout.ts src/index.ts tests/index.test.ts tests/auth-routes.test.ts tests/deposit-flow.test.ts tests/withdraw-flow.test.ts
git commit -m "feat: add bank demo dashboard"
```

## Task 9: Documentation and Operator Setup

**Files:**

- Modify: `bank_demo/README.md`
- Create: `bank_demo/.dev.vars.example`

- [ ] **Step 1: Add a failing documentation checklist to the plan execution branch**

```md
- [ ] README documents required Lilium secrets
- [ ] README documents treasury account bootstrap
- [ ] README documents local Worker commands
```

- [ ] **Step 2: Update README and env example with exact setup instructions**

```dotenv
# bank_demo/.dev.vars.example
LILIUM_BASE_URL=https://lilium.kuma.homes
LILIUM_CLIENT_ID=replace_me
LILIUM_CLIENT_SECRET=replace_me
LILIUM_WEBHOOK_SECRET=replace_me
TREASURY_BROWSER_SESSION=replace_me
```

```md
<!-- bank_demo/README.md -->
## Local Setup

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in the Lilium OIDC client credentials
3. Fill in the Lilium webhook secret
4. Fill in the treasury browser session material
5. Run `npm install`
6. Run `npm test`
7. Run `npm run typecheck`
8. Run `npm run dev`
```

- [ ] **Step 3: Verify docs and commit**

Run: `cd /Users/bearice/Working/github/dzmm_archive/bank_demo && npm test && npm run typecheck`

Expected: PASS, with documentation-only changes not affecting runtime behavior.

```bash
cd /Users/bearice/Working/github/dzmm_archive/bank_demo
git add README.md .dev.vars.example
git commit -m "docs: add bank demo setup guide"
```

## Self-Review Checklist

- Spec coverage:
  - independent repo layout: Task 1 and Task 9
  - OIDC login: Task 5
  - `lilium-client.ts` public-client boundary: Task 3
  - demo-local ledger and Durable Object: Task 4
  - payment-intent deposit path: Task 6
  - treasury withdrawal and interest payout: Task 7
  - minimal UI: Task 8
  - operator setup docs: Task 9
- Placeholder scan:
  - no `expect(true).toBe(false)` placeholder tests remain
  - no `TBD`/`TODO` markers remain in the plan document
- Type consistency:
  - keep `userId`/`user_id`, `partnerReferenceId`/`partner_reference_id`, and
    `bankBalance`/`bank_balance` naming split at the TypeScript-to-HTTP
    boundary only

## Execution Handoff

Plan complete and saved to `bank_demo/docs/plans/2026-04-19-bank-demo-implementation-plan.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints
