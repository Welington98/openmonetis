import { describe, expect, it } from "vitest";
import { calculateAvailableBalance } from "@/features/daily-budget/lib/available-balance";

describe("calculateAvailableBalance", () => {
	it("returns the full monthly budget when nothing has been spent yet", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			spentThisMonth: 0,
			futureKnownExpenses: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(1000);
	});

	it("reserves a large known future expense before dividing, instead of smoothing it", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			spentThisMonth: 0,
			futureKnownExpenses: 800,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(200);
	});

	it("deducts what has already been spent this month", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			spentThisMonth: 300,
			futureKnownExpenses: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(700);
	});

	it("deducts planned savings and a safety buffer", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			spentThisMonth: 200,
			futureKnownExpenses: 0,
			targetSavings: 300,
			safetyBuffer: 100,
		});

		expect(result.availableBalance).toBe(400);
	});

	it("goes negative when spending and commitments exceed the monthly budget", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 500,
			spentThisMonth: 400,
			futureKnownExpenses: 300,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(-200);
	});
});
