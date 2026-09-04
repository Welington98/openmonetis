import { describe, expect, it } from "vitest";
import { calculateAvailableBalance } from "@/features/daily-budget/lib/available-balance";

describe("calculateAvailableBalance", () => {
	it("returns the full monthly budget when nothing has been spent yet", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 0,
			variableSpentSoFar: 0,
			variableFutureKnown: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(1000);
	});

	it("reserves a large known future variable expense before dividing, instead of smoothing it", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 0,
			variableSpentSoFar: 0,
			variableFutureKnown: 800,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(200);
	});

	it("deducts what has already been spent this month on variable expenses", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 0,
			variableSpentSoFar: 300,
			variableFutureKnown: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(700);
	});

	it("deducts planned savings and a safety buffer", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 0,
			variableSpentSoFar: 200,
			variableFutureKnown: 0,
			targetSavings: 300,
			safetyBuffer: 100,
		});

		expect(result.availableBalance).toBe(400);
	});

	it("goes negative when spending and commitments exceed the monthly budget", () => {
		const result = calculateAvailableBalance({
			monthlyBudgetTotal: 500,
			totalFixedThisMonth: 300,
			variableSpentSoFar: 400,
			variableFutureKnown: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.availableBalance).toBe(-200);
	});

	it("deducts fixed expenses for the whole month regardless of whether they were already paid", () => {
		// A cost center "fixa" já entra no cálculo inteiro no dia 1º — não
		// importa se a conta já foi paga ou ainda está agendada pra frente,
		// o resultado é o mesmo (é isso que evita o "estouro" ao pagar
		// contas no início do mês).
		const paidEarly = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 600,
			variableSpentSoFar: 0,
			variableFutureKnown: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});
		const stillScheduled = calculateAvailableBalance({
			monthlyBudgetTotal: 1000,
			totalFixedThisMonth: 600,
			variableSpentSoFar: 0,
			variableFutureKnown: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(paidEarly.availableBalance).toBe(400);
		expect(paidEarly.availableBalance).toBe(stillScheduled.availableBalance);
	});
});
