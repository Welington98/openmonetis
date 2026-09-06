import { describe, expect, it } from "vitest";
import { calculateAverageDailySpending } from "@/features/daily-budget/lib/average-spending";

describe("calculateAverageDailySpending", () => {
	it("returns zero for a month with no elapsed days and no history", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 0,
			daysElapsedInCycle: 0,
			daysInCycle: 30,
			historicalDailyAverages: [],
		});

		expect(result.averageDailySpending).toBe(0);
	});

	it("returns zero when nothing has been spent yet and there's no history", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 0,
			daysElapsedInCycle: 5,
			daysInCycle: 30,
			historicalDailyAverages: [],
		});

		expect(result.averageDailySpending).toBe(0);
	});

	it("divides total spent by days elapsed when there's no history to blend with", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 350,
			daysElapsedInCycle: 8,
			daysInCycle: 30,
			historicalDailyAverages: [],
		});

		expect(result.averageDailySpending).toBeCloseTo(43.75, 2);
	});

	it("falls back entirely to the historical average on day zero of the cycle", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 0,
			daysElapsedInCycle: 0,
			daysInCycle: 30,
			historicalDailyAverages: [40, 60],
		});

		expect(result.averageDailySpending).toBe(50);
	});

	it("blends current pace and history proportionally to days elapsed", () => {
		// 10 de 30 dias decorridos -> 1/3 de peso pro ritmo atual, 2/3 pro histórico.
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 300, // ritmo atual = 30/dia
			daysElapsedInCycle: 10,
			daysInCycle: 30,
			historicalDailyAverages: [60],
		});

		expect(result.averageDailySpending).toBeCloseTo(
			30 * (1 / 3) + 60 * (2 / 3),
			5,
		);
	});

	it("relies entirely on the current pace once the cycle is fully elapsed", () => {
		const result = calculateAverageDailySpending({
			totalVariableSpentThisCycle: 900,
			daysElapsedInCycle: 30,
			daysInCycle: 30,
			historicalDailyAverages: [60],
		});

		expect(result.averageDailySpending).toBeCloseTo(30, 5);
	});
});
