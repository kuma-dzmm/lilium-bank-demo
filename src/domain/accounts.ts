export interface DemoLedgerEntry {
  kind: string;
  amount: string;
  balanceAfter: string;
  liliumReferenceId?: string;
}

export interface DemoAccountState {
  userId: string;
  bankBalance: string;
  lastInterestAccrualDate: string;
  entries: DemoLedgerEntry[];
}

export function createEmptyAccount(userId = ""): DemoAccountState {
  return {
    userId,
    bankBalance: "0.00",
    lastInterestAccrualDate: new Date().toISOString().slice(0, 10),
    entries: [],
  };
}
