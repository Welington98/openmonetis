import { describe, expect, it } from "vitest";
import { calculateDailyBudget } from "@/features/daily-budget/lib/daily-budget";

describe("calculateDailyBudget", () => {
	it("divides the available balance by the days remaining in automatic mode", () => {
		const result = calculateDailyBudget({
			availableBalance: 1000,
			daysRemaining: 20,
			calculationMode: "automatico",
			customDailyLimit: null,
			spentToday: 0,
		});

		expect(result.dailyBudgetAmount).toBe(50);
		expect(result.remainingToday).toBe(50);
		expect(result.isDeficit).toBe(false);
	});

	it("returns R$0 and flags a deficit when the available balance is negative in automatic mode", () => {
		const result = calculateDailyBudget({
			availableBalance: -200,
			daysRemaining: 10,
			calculationMode: "automatico",
			customDailyLimit: null,
			spentToday: 0,
		});

		expect(result.dailyBudgetAmount).toBe(0);
		expect(result.isDeficit).toBe(true);
	});

	it("uses the user's fixed limit in personalized mode instead of dividing", () => {
		const result = calculateDailyBudget({
			availableBalance: 1000,
			daysRemaining: 20,
			calculationMode: "personalizado",
			customDailyLimit: 50,
			spentToday: 10,
		});

		expect(result.dailyBudgetAmount).toBe(50);
		expect(result.remainingToday).toBe(40);
	});

	it("flags risk of running negative before the next income in personalized mode", () => {
		const result = calculateDailyBudget({
			availableBalance: 100,
			daysRemaining: 20,
			calculationMode: "personalizado",
			customDailyLimit: 50, // 50 * 20 = 1000 > 100 disponível
			spentToday: 0,
		});

		expect(result.personalizedLimitRisksNegativeBalance).toBe(true);
	});

	it("does not flag risk when the fixed limit fits comfortably within what's available", () => {
		const result = calculateDailyBudget({
			availableBalance: 2000,
			daysRemaining: 20,
			calculationMode: "personalizado",
			customDailyLimit: 50,
			spentToday: 0,
		});

		expect(result.personalizedLimitRisksNegativeBalance).toBe(false);
	});

	it("raises tomorrow's budget when today's spend comes in under budget (dynamic reallocation)", () => {
		// Dia 1: R$1000 / 20 dias = R$50/dia. Usuário gasta só R$20.
		const day1 = calculateDailyBudget({
			availableBalance: 1000,
			daysRemaining: 20,
			calculationMode: "automatico",
			customDailyLimit: null,
			spentToday: 20,
		});
		expect(day1.dailyBudgetAmount).toBe(50);

		// Dia 2: saldo já reflete o gasto real (980), um dia a menos (19).
		const day2 = calculateDailyBudget({
			availableBalance: 980,
			daysRemaining: 19,
			calculationMode: "automatico",
			customDailyLimit: null,
			spentToday: 0,
		});
		expect(day2.dailyBudgetAmount).toBeCloseTo(51.58, 2);
	});

	it("lowers tomorrow's budget when today's spend comes in over budget", () => {
		const day2 = calculateDailyBudget({
			availableBalance: 900,
			daysRemaining: 19,
			calculationMode: "automatico",
			customDailyLimit: null,
			spentToday: 0,
		});

		expect(day2.dailyBudgetAmount).toBeCloseTo(47.37, 2);
	});
});
