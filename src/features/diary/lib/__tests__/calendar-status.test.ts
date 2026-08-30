import { describe, expect, it } from "vitest";
import { computeDayStatuses } from "@/features/diary/lib/calendar-status";

const DAYS_IN_AUGUST_2026 = Array.from(
	{ length: 31 },
	(_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`,
);

describe("computeDayStatuses", () => {
	it("marks a day without a diary entry as gray", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [],
			rollingAverageDailySpend: null,
			monthlyBudgetTotal: null,
		});

		expect(statuses["2026-08-01"]).toBe("gray");
	});

	it("marks a day with a check-in but no expense as green", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [{ entryDate: "2026-08-05", hadExpense: false, amount: null }],
			rollingAverageDailySpend: 50,
			monthlyBudgetTotal: 1000,
		});

		expect(statuses["2026-08-05"]).toBe("green");
	});

	it("marks an expense day at or below the rolling average as green", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [{ entryDate: "2026-08-05", hadExpense: true, amount: 40 }],
			rollingAverageDailySpend: 50,
			monthlyBudgetTotal: null,
		});

		expect(statuses["2026-08-05"]).toBe("green");
	});

	it("marks an expense day above the rolling average as yellow", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [{ entryDate: "2026-08-05", hadExpense: true, amount: 90 }],
			rollingAverageDailySpend: 50,
			monthlyBudgetTotal: null,
		});

		expect(statuses["2026-08-05"]).toBe("yellow");
	});

	it("marks the day that pushes the month-to-date total past the budget as red, even if it alone would be green", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [
				{ entryDate: "2026-08-01", hadExpense: true, amount: 400 },
				{ entryDate: "2026-08-02", hadExpense: true, amount: 400 },
				// Isolado, 300 é <= a média de 500 (verde), mas o acumulado
				// (400+400+300=1100) estoura o orçamento de 1000.
				{ entryDate: "2026-08-03", hadExpense: true, amount: 300 },
			],
			rollingAverageDailySpend: 500,
			monthlyBudgetTotal: 1000,
		});

		expect(statuses["2026-08-01"]).toBe("green");
		expect(statuses["2026-08-02"]).toBe("green");
		expect(statuses["2026-08-03"]).toBe("red");
	});

	it("never shows red when there is no budget for the period, capping at yellow", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [{ entryDate: "2026-08-01", hadExpense: true, amount: 10_000 }],
			rollingAverageDailySpend: 50,
			monthlyBudgetTotal: null,
		});

		expect(statuses["2026-08-01"]).toBe("yellow");
	});

	it("defaults a positive-expense day to green when there is no rolling average yet, unless the budget rule fires", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [{ entryDate: "2026-08-01", hadExpense: true, amount: 500 }],
			rollingAverageDailySpend: null,
			monthlyBudgetTotal: null,
		});

		expect(statuses["2026-08-01"]).toBe("green");
	});

	it("stays red for subsequent expense days once the month is already over budget, but a zero-expense day right after is still green", () => {
		const statuses = computeDayStatuses({
			daysInPeriod: DAYS_IN_AUGUST_2026,
			entries: [
				{ entryDate: "2026-08-01", hadExpense: true, amount: 1200 },
				{ entryDate: "2026-08-02", hadExpense: true, amount: 10 },
				{ entryDate: "2026-08-03", hadExpense: false, amount: null },
			],
			rollingAverageDailySpend: 50,
			monthlyBudgetTotal: 1000,
		});

		expect(statuses["2026-08-01"]).toBe("red");
		expect(statuses["2026-08-02"]).toBe("red");
		expect(statuses["2026-08-03"]).toBe("green");
	});
});
