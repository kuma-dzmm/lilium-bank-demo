import { renderLayout } from "./layout";

export function renderHome(): string {
  return renderLayout(
    "bank_demo",
    `
      <main class="page-shell">
        <section class="panel">
          <div class="panel-hero">
            <p class="eyebrow">Bank Demo</p>
            <h1>bank_demo</h1>
            <p class="lead">一个基于 Lilium 公开接口实现的第三方演示银行。你可以登录、存款、取款，并查看内部记账后的余额变化。</p>
          </div>
          <div class="panel-body stack">
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">登录方式</div>
                  <p class="lead">使用 Lilium OIDC 登录，银行账户身份与平台账户保持关联，但余额单独记账。</p>
                </article>
              </div>
              <div class="col-12 col-md-6">
                <article class="card h-100">
                  <div class="card-label">清算方式</div>
                  <p class="lead">存款走 Hosted Checkout，取款走清算打款，利息按每日定时任务记入内部账户。</p>
                </article>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-3">
              <a class="button" href="/auth/login">使用 Lilium 登录</a>
              <span class="muted align-self-center">演示站点：bank.kuma.homes</span>
            </div>
          </div>
        </section>
      </main>
    `,
  );
}
