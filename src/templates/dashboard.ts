import { renderLayout } from "./layout";

export function renderDashboard(input: {
  displayName: string;
  userId: string;
  userCashBalance: string;
  bankCashBalance: string;
  bankBalance: string;
  lastInterestAccrualDate: string;
  depositRequestId: string;
  withdrawRequestId: string;
  entries: Array<{ kind: string; amount: string; balanceAfter: string }>;
}): string {
  const entryList = input.entries
    .map(
      (entry) =>
        `<li>${entry.kind}: ${entry.amount} (balance ${entry.balanceAfter})</li>`,
    )
    .join("");

  return renderLayout(
    "bank_demo dashboard",
    `
      <main class="page-shell">
        <section class="panel">
          <div class="panel-hero">
            <p class="eyebrow">Account</p>
            <h1>${input.displayName}</h1>
            <p class="lead">Lilium 账户 ID：${input.userId}</p>
          </div>
          <div class="panel-body stack">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">用户现金</div>
                  <div class="metric">$${input.userCashBalance}</div>
                  <div class="muted">通过 user token 查询</div>
                </article>
              </div>
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">银行清算账户现金</div>
                  <div class="metric">$${input.bankCashBalance}</div>
                  <div class="muted">通过 client token 查询</div>
                </article>
              </div>
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">银行内部余额</div>
                  <div class="metric">$${input.bankBalance}</div>
                </article>
              </div>
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">最近计息日</div>
                  <div class="metric" style="font-size: 1.35rem;">${input.lastInterestAccrualDate}</div>
                </article>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">存款</div>
                  <form class="inline-form" method="post" action="/deposit">
                    <input type="hidden" name="request_id" value="${input.depositRequestId}" />
                    <input type="text" name="amount" value="10.00" />
                    <select
                      name="mode"
                      style="border-radius: 14px; border: 1px solid var(--line); background: #fffdf9; padding: 12px 14px; font: inherit; color: var(--text);"
                    >
                      <option value="charge">直接扣款入账</option>
                      <option value="reserve">先锁定再清算入账</option>
                    </select>
                    <button type="submit">存入</button>
                  </form>
                </article>
              </div>
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">取款</div>
                  <form class="inline-form" method="post" action="/withdraw">
                    <input type="hidden" name="request_id" value="${input.withdrawRequestId}" />
                    <input type="text" name="amount" value="5.00" />
                    <button type="submit" class="secondary">取出</button>
                  </form>
                </article>
              </div>
            </div>

            <section class="stack">
              <div>
                <div class="card-label">最近流水</div>
              </div>
              <ul class="activity-list">${entryList || '<li><span class="entry-kind muted">还没有流水记录</span></li>'}</ul>
            </section>
          </div>
        </section>
      </main>
    `,
  );
}
