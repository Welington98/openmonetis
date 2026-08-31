import { describe, expect, it } from "vitest";
import { calculateAverageDailySpending } from "@/features/daily-budget/lib/average-spending";

describe("calculateAverageDailySpending", () => {
	it("returns zero for a month with no elapsed days", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 0,
			daysElapsedInCycle: 0,
		});

		expect(result.averageDailySpending).toBe(0);
	});

	it("returns zero when nothing has been spent yet", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 0,
			daysElapsedInCycle: 5,
		});

		expect(result.averageDailySpending).toBe(0);
	});

	it("divides total spent by days elapsed", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 350,
			daysElapsedInCycle: 8,
		});

		expect(result.averageDailySpending).toBeCloseTo(43.75, 2);
	});
});
