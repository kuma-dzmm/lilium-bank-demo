import { describe, expect, it } from "vitest";
import { computeLazyInterest } from "../src/domain/interest";

describe("computeLazyInterest", () => {
  it("returns zero when no whole day elapsed", () => {
    const result = computeLazyInterest({
      balance: "100.00",
      lastInterestAccrualDate: "2026-04-19",
      today: "2026-04-19",
    });

    expect(result.amount).toBe("0.00");
    expect(result.elapsedDays).toBe(0);
  });

  it("computes one day of 0.1% interest", () => {
    const result = computeLazyInterest({
      balance: "100.00",
      lastInterestAccrualDate: "2026-04-18",
      today: "2026-04-19",
    });

    expect(result.amount).toBe("0.10");
    expect(result.elapsedDays).toBe(1);
  });
});
