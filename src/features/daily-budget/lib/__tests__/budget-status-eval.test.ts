import { describe, expect, it } from "vitest";
import {
	evaluateBudgetStatus,
	evaluateIncomeWarning,
} from "@/features/daily-budget/lib/budget-status-eval";

const baseStatusInput = {
	daysElapsed: 15,
	daysInMonth: 30,
	monthlyBudgetTotal: 1000,
	spentThisMonth: 300,
	greenThresholdPct: 20,
	yellowThresholdPct: 5,
};

describe("evaluateBudgetStatus", () => {
	it("classifies as green when spending slower than the calendar pace", () => {
		// 50% dos dias passados, só 30% do orçamento gasto -> folga de 20pp
		const result = evaluateBudgetStatus(baseStatusInput);

		expect(result.slackPct).toBe(20);
		expect(result.statusColor).toBe("green");
	});

	it("classifies as red when spending faster than the calendar pace", () => {
		const result = evaluateBudgetStatus({
			...baseStatusInput,
			spentThisMonth: 700, // 70% gasto com só 50% dos dias passados
		});

		expect(result.slackPct).toBe(-20);
		expect(result.statusColor).toBe("red");
	});

	it("classifies as yellow in the middle band", () => {
		const result = evaluateBudgetStatus({
			...baseStatusInput,
			spentThisMonth: 440, // 44% gasto, 50% dos dias -> folga de 6pp (entre 5 e 20)
		});

		expect(result.slackPct).toBe(6);
		expect(result.statusColor).toBe("yellow");
	});

	it("respects custom thresholds instead of hardcoded bands", () => {
		const result = evaluateBudgetStatus({
			...baseStatusInput,
			spentThisMonth: 480, // folga de 2pp
			yellowThresholdPct: 1,
		});

		expect(result.statusColor).toBe("yellow");
	});
});

describe("evaluateIncomeWarning", () => {
	it("flags when the planned budget exceeds expected income", () => {
		const result = evaluateIncomeWarning({
			monthlyBudgetTotal: 1000,
			expectedIncome: 800,
		});

		expect(result.isOverIncome).toBe(true);
		expect(result.difference).toBe(200);
	});

	it("does not flag when the budget fits within expected income", () => {
		const result = evaluateIncomeWarning({
			monthlyBudgetTotal: 800,
			expectedIncome: 1000,
		});

		expect(result.isOverIncome).toBe(false);
		expect(result.difference).toBe(-200);
	});
});
