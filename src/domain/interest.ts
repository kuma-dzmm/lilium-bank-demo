const DAILY_RATE = 0.001;

export interface ComputeLazyInterestInput {
  balance: string;
  lastInterestAccrualDate: string;
  today: string;
}

export interface ComputeLazyInterestResult {
  amount: string;
  elapsedDays: number;
}

export function computeLazyInterest(
  input: ComputeLazyInterestInput,
): ComputeLazyInterestResult {
  const elapsedDays = Math.max(
    0,
    Math.floor(
      (Date.parse(`${input.today}T00:00:00Z`) -
        Date.parse(`${input.lastInterestAccrualDate}T00:00:00Z`)) /
        86_400_000,
    ),
  );

  const amount =
    elapsedDays === 0
      ? "0.00"
      : (Number(input.balance) * DAILY_RATE * elapsedDays).toFixed(2);

  return { amount, elapsedDays };
}
