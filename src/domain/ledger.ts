import type { DemoAccountState, DemoLedgerEntry } from "./accounts";

export function appendLedgerEntry(
  account: DemoAccountState,
  entry: DemoLedgerEntry,
): DemoAccountState {
  return {
    ...account,
    bankBalance: entry.balanceAfter,
    entries: [...account.entries, entry],
  };
}
