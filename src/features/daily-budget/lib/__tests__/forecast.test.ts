import { describe, expect, it } from "vitest";
import { calculateDailyForecast } from "@/features/daily-budget/lib/forecast";

describe("calculateDailyForecast", () => {
	it("divides the monthly total by the days of the month", () => {
		const result = calculateDailyForecast(
			[{ amount: 700 }, { amount: 450 }, { amount: 300 }, { amount: 200 }],
			30,
		);

		expect(result.monthlyTotal).toBe(1650);
		expect(result.days).toBe(30);
		expect(result.dailyAmount).toBe(55);
	});

	it("rounds down to cents so the daily limit never exceeds the forecast", () => {
		const result = calculateDailyForecast([{ amount: 1000 }], 30);

		expect(result.dailyAmount).toBe(33.33);
	});

	it("returns zero for an empty list", () => {
		const result = calculateDailyForecast([], 31);

		expect(result.monthlyTotal).toBe(0);
		expect(result.dailyAmount).toBe(0);
	});

	it("never divides by zero and ignores negative amounts", () => {
		const result = calculateDailyForecast([{ amount: 90 }, { amount: -50 }], 0);

		expect(result.days).toBe(1);
		expect(result.monthlyTotal).toBe(90);
		expect(result.dailyAmount).toBe(90);
	});
});
