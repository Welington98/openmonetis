import { describe, expect, it } from "vitest";
import { calculateAccumulatedSavings } from "@/features/daily-budget/lib/accumulated-savings";

describe("calculateAccumulatedSavings", () => {
	it("returns zero when spending matches the ideal pace exactly", () => {
		const result = calculateAccumulatedSavings({
			dailyBudgetAmount: 50,
			daysElapsed: 10,
			variableSpentSoFar: 500,
		});

		expect(result.accumulatedSavings).toBe(0);
	});

	it("is positive when spending less than the ideal pace so far", () => {
		const result = calculateAccumulatedSavings({
			dailyBudgetAmount: 50,
			daysElapsed: 10,
			variableSpentSoFar: 350,
		});

		expect(result.accumulatedSavings).toBe(150);
	});

	it("is negative when spending more than the ideal pace so far", () => {
		const result = calculateAccumulatedSavings({
			dailyBudgetAmount: 50,
			daysElapsed: 10,
			variableSpentSoFar: 700,
		});

		expect(result.accumulatedSavings).toBe(-200);
	});

	it("treats a negative daysElapsed as zero days elapsed", () => {
		const result = calculateAccumulatedSavings({
			dailyBudgetAmount: 50,
			daysElapsed: -1,
			variableSpentSoFar: 0,
		});

		expect(result.accumulatedSavings).toBe(0);
	});
});
