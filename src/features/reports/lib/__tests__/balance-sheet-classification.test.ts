import { describe, expect, it } from "vitest";
import {
	classifyAccountType,
	computeBalanceSheetTotals,
} from "@/features/reports/lib/balance-sheet-classification";

describe("classifyAccountType", () => {
	it("classifies a taken-out loan (Empréstimo Contratado) as passivo — it's a debt", () => {
		expect(classifyAccountType("Empréstimo Contratado")).toBe("passivo");
	});

	it("classifies money lent to others (Empréstimo Concedido) as ativo — it's a receivable, not confused with the debt type despite sharing the word 'empréstimo'", () => {
		expect(classifyAccountType("Empréstimo Concedido")).toBe("ativo");
	});

	it("still classifies credit cards as passivo", () => {
		expect(classifyAccountType("Cartão de Crédito")).toBe("passivo");
	});

	it("defaults an unrecognized type to ativo", () => {
		expect(classifyAccountType("Conta Corrente")).toBe("ativo");
	});
});

describe("computeBalanceSheetTotals", () => {
	it("nets a taken-out loan's negative balance into a positive passivo/debt figure", () => {
		const totals = computeBalanceSheetTotals([
			{ balance: 5000, classification: "ativo" },
			{ balance: -8000, classification: "passivo" },
		]);

		expect(totals).toEqual({
			ativo: 5000,
			passivo: 8000,
			patrimonioLiquido: -3000,
		});
	});

	it("counts a loan given to a third party (Empréstimo Concedido) as a positive receivable inside ativo", () => {
		const totals = computeBalanceSheetTotals([
			{ balance: 3000, classification: "ativo" }, // ex: saldo pendente do Empréstimo Concedido
		]);

		expect(totals.ativo).toBe(3000);
	});
});
