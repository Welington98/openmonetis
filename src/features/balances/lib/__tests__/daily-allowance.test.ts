import { describe, expect, it } from "vitest";
import { calculateBalanceDailyAllowance } from "@/features/balances/lib/daily-allowance";

describe("calculateBalanceDailyAllowance", () => {
	it("splits the leftover monthly budget evenly across the days of the month", () => {
		const result = calculateBalanceDailyAllowance({
			calculationMode: "automatico",
			customDailyLimit: null,
			monthlyBudgetTotal: 3000,
			fixedThisMonth: 900,
			variableKnownThisMonth: 300,
			daysInMonth: 30,
		});

		expect(result).toBe(60); // (3000 - 900 - 300) / 30
	});

	it("returns 0 — not a positive leftover — when known spend already exceeds the budget", () => {
		const result = calculateBalanceDailyAllowance({
			calculationMode: "automatico",
			customDailyLimit: null,
			monthlyBudgetTotal: 8330,
			fixedThisMonth: 0,
			variableKnownThisMonth: 10948.77,
			daysInMonth: 30,
		});

		expect(result).toBe(0);
	});

	it("uses the custom limit directly in modo personalizado, ignoring known spend", () => {
		const result = calculateBalanceDailyAllowance({
			calculationMode: "personalizado",
			customDailyLimit: 80,
			monthlyBudgetTotal: 100,
			fixedThisMonth: 1000,
			variableKnownThisMonth: 1000,
			daysInMonth: 30,
		});

		expect(result).toBe(80);
	});

	it("floors a negative custom limit to 0", () => {
		const result = calculateBalanceDailyAllowance({
			calculationMode: "personalizado",
			customDailyLimit: -10,
			monthlyBudgetTotal: 100,
			fixedThisMonth: 0,
			variableKnownThisMonth: 0,
			daysInMonth: 30,
		});

		expect(result).toBe(0);
	});

	it("returns 0 when there is no registered monthly budget", () => {
		const result = calculateBalanceDailyAllowance({
			calculationMode: "automatico",
			customDailyLimit: null,
			monthlyBudgetTotal: 0,
			fixedThisMonth: 0,
			variableKnownThisMonth: 0,
			daysInMonth: 30,
		});

		expect(result).toBe(0);
	});
});
