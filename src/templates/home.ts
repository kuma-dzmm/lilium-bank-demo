import { renderLayout } from "./layout";

export function renderHome(): string {
  return renderLayout(
    "bank_demo",
    `
      <main>
        <h1>bank_demo</h1>
        <p>A third-party demo bank built on top of Lilium public APIs.</p>
        <a href="/auth/login">Sign in with Lilium</a>
      </main>
    `,
  );
}
