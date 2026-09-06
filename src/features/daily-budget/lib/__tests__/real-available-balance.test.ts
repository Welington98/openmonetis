import { describe, expect, it } from "vitest";
import { calculateRealAvailableBalance } from "@/features/daily-budget/lib/real-available-balance";

describe("calculateRealAvailableBalance", () => {
	it("returns the current balance when there are no future commitments", () => {
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 1000,
			futureIncome: 0,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.realAvailableBalance).toBe(1000);
	});

	it("adds income that hasn't landed in the accounts yet", () => {
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 500,
			futureIncome: 3000,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.realAvailableBalance).toBe(3500);
	});

	it("reserves known future non-card expenses", () => {
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 2000,
			futureIncome: 0,
			nonCardFutureExpenses: 800,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.realAvailableBalance).toBe(1200);
	});

	it("reserves the full unpaid credit card invoice, past and future purchases alike", () => {
		// A fatura em aberto reserva o valor inteiro de uma vez só — não importa
		// se a compra que compõe a fatura já aconteceu ou ainda vai acontecer,
		// nenhuma das duas saiu da conta ainda.
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 2000,
			futureIncome: 0,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 1200,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.realAvailableBalance).toBe(800);
	});

	it("reserves planned savings and a safety buffer", () => {
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 2000,
			futureIncome: 0,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 0,
			targetSavings: 500,
			safetyBuffer: 200,
		});

		expect(result.realAvailableBalance).toBe(1300);
	});

	it("goes negative when known future commitments exceed what you have and will receive", () => {
		const result = calculateRealAvailableBalance({
			currentAccountsBalance: 100,
			futureIncome: 200,
			nonCardFutureExpenses: 500,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(result.realAvailableBalance).toBe(-200);
	});

	it("does not double-count expenses that already happened, since they're already reflected in the balance", () => {
		// Um mês estourado reduz o saldo real das contas por conta própria —
		// não existe um "variableSpentSoFar" nesse cálculo pra descontar de
		// novo, diferente do cálculo baseado em orçamento cadastrado.
		const overspentMonth = calculateRealAvailableBalance({
			currentAccountsBalance: -300, // já reflete o estouro do mês anterior
			futureIncome: 0,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(overspentMonth.realAvailableBalance).toBe(-300);
	});

	it("does not reserve a card invoice that's already been paid, since the payment already left the balance", () => {
		// A fatura paga não entra em `unpaidCardDebt` — o pagamento em si já é
		// um lançamento normal, já refletido em `currentAccountsBalance`.
		const paidInvoice = calculateRealAvailableBalance({
			currentAccountsBalance: 800, // já reflete o pagamento da fatura de 1200
			futureIncome: 0,
			nonCardFutureExpenses: 0,
			unpaidCardDebt: 0,
			targetSavings: 0,
			safetyBuffer: 0,
		});

		expect(paidInvoice.realAvailableBalance).toBe(800);
	});
});
