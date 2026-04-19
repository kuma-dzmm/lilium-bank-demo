import { renderLayout } from "./layout";

export function renderDashboard(input: {
  displayName: string;
  userId: string;
  bankBalance: string;
  lastInterestAccrualDate: string;
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
      <main>
        <h1>${input.displayName}</h1>
        <p>User ID: ${input.userId}</p>
        <p>Demo bank balance: ${input.bankBalance}</p>
        <p>Last settled interest date: ${input.lastInterestAccrualDate}</p>
        <form method="post" action="/deposit">
          <input type="text" name="amount" value="10.00" />
          <button>Deposit</button>
        </form>
        <form method="post" action="/withdraw">
          <input type="text" name="amount" value="5.00" />
          <button>Withdraw</button>
        </form>
        <ul>${entryList}</ul>
      </main>
    `,
  );
}
