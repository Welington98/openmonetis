import { describe, expect, it } from "vitest";
import { generateMultiMonthProjection } from "@/features/daily-budget/lib/daily-projection";

describe("generateMultiMonthProjection", () => {
	it("assumes the daily budget as spend on empty future days, decreasing the remaining budget", () => {
		const result = generateMultiMonthProjection({
			months: [
				{
					period: "2026-08",
					monthStart: "2026-08-24",
					monthEnd: "2026-08-27",
					today: "2026-08-24",
					monthlyBudgetTotal: 1000,
					dailyBudgetAmount: 50,
					daysWithKnownData: [],
					isEstimated: false,
				},
			],
		});

		expect(result.months[0]?.days).toEqual([
			{
				date: "2026-08-24",
				income: 0,
				expenses: 0,
				dailyBudget: 50,
				remainingBudget: 1000,
			},
			{
				date: "2026-08-25",
				income: 0,
				expenses: 50,
				dailyBudget: 50,
				remainingBudget: 950,
			},
			{
				date: "2026-08-26",
				income: 0,
				expenses: 50,
				dailyBudget: 50,
				remainingBudget: 900,
			},
			{
				date: "2026-08-27",
				income: 0,
				expenses: 50,
				dailyBudget: 50,
				remainingBudget: 850,
			},
		]);
	});

	it("shows known future income as informational, without adding it back to the remaining budget", () => {
		const result = generateMultiMonthProjection({
			months: [
				{
					period: "2026-08",
					monthStart: "2026-08-24",
					monthEnd: "2026-08-25",
					today: "2026-08-24",
					monthlyBudgetTotal: 0,
					dailyBudgetAmount: 50,
					daysWithKnownData: [
						{ date: "2026-08-25", income: 2500, expenses: 0 },
					],
					isEstimated: false,
				},
			],
		});

		expect(result.months[0]?.days[1]).toEqual({
			date: "2026-08-25",
			income: 2500,
			expenses: 50,
			dailyBudget: 50,
			remainingBudget: -50, // 0 (dia 24, sem gasto real) - 50 (dia 25, orçamento assumido) — renda não entra
		});
	});

	it("uses the real recorded spend for past days instead of the daily budget", () => {
		const result = generateMultiMonthProjection({
			months: [
				{
					period: "2026-08",
					monthStart: "2026-08-20",
					monthEnd: "2026-08-22",
					today: "2026-08-22",
					monthlyBudgetTotal: 1000,
					dailyBudgetAmount: 50,
					daysWithKnownData: [
						{ date: "2026-08-21", income: 0, expenses: 18.2 },
					],
					isEstimated: false,
				},
			],
		});

		const days = result.months[0]?.days ?? [];
		expect(days[1]?.expenses).toBe(18.2);
		expect(days[0]?.expenses).toBe(0);
	});

	it("does not double-count the daily budget when a future day already has a materialized expense", () => {
		const result = generateMultiMonthProjection({
			months: [
				{
					period: "2026-08",
					monthStart: "2026-08-24",
					monthEnd: "2026-08-25",
					today: "2026-08-24",
					monthlyBudgetTotal: 1000,
					dailyBudgetAmount: 50,
					daysWithKnownData: [
						{ date: "2026-08-25", income: 0, expenses: 300 }, // ex: parcela de cartão
					],
					isEstimated: false,
				},
			],
		});

		expect(result.months[0]?.days[1]?.expenses).toBe(300);
	});

	it("projects multiple months in order, each starting fresh from its own monthly budget", () => {
		const result = generateMultiMonthProjection({
			months: [
				{
					period: "2026-08",
					monthStart: "2026-08-31",
					monthEnd: "2026-08-31",
					today: "2026-08-31",
					monthlyBudgetTotal: 100,
					dailyBudgetAmount: 100,
					daysWithKnownData: [],
					isEstimated: false,
				},
				{
					period: "2026-09",
					monthStart: "2026-09-01",
					monthEnd: "2026-09-02",
					today: "2026-08-31",
					monthlyBudgetTotal: 900,
					dailyBudgetAmount: 30,
					daysWithKnownData: [],
					isEstimated: true,
				},
			],
		});

		expect(result.months).toHaveLength(2);
		expect(result.months[0]?.period).toBe("2026-08");
		expect(result.months[1]?.period).toBe("2026-09");
		expect(result.months[1]?.isEstimated).toBe(true);
		// setembro começa do zero com o próprio orçamento, não herda o resto de agosto
		expect(result.months[1]?.days[0]?.remainingBudget).toBe(870);
	});
});
