import { describe, expect, it } from "vitest";
import type { StatementLineWithCategory } from "../../queries";
import {
	applyBulkOverrides,
	detectInstallments,
	isDraftComplete,
	type LineDraft,
} from "../line-draft";

function makeLine(
	overrides: Partial<StatementLineWithCategory> = {},
): StatementLineWithCategory {
	return {
		id: "line-1",
		description: "Mercado",
		amount: "50.00",
		type: "despesa",
		date: "2026-10-01",
		pluggyAccountType: "BANK",
		linkedFinancialAccountId: "acc-1",
		linkedCardId: null,
		categoryId: "cat-1",
		...overrides,
	} as StatementLineWithCategory;
}

const noOverrides = {
	categoryId: null,
	costCenterId: null,
	accountId: null,
	cardId: null,
	payerId: null,
	paymentMethod: null,
};

describe("detectInstallments", () => {
	it("detecta sufixo de parcela", () => {
		expect(detectInstallments("Loja 02/04")).toEqual({ current: 2, total: 4 });
	});
	it("ignora valores inválidos", () => {
		expect(detectInstallments("Loja 05/04")).toBeNull();
		expect(detectInstallments("Loja")).toBeNull();
	});
});

describe("applyBulkOverrides", () => {
	it("retorna null para despesa sem centro de custo", () => {
		expect(
			applyBulkOverrides(makeLine(), undefined, "p1", noOverrides),
		).toBeNull();
	});

	it("monta rascunho com padrões da linha e override de centro de custo", () => {
		const draft = applyBulkOverrides(makeLine(), undefined, "p1", {
			...noOverrides,
			costCenterId: "cc-1",
		});
		expect(draft).toMatchObject({
			accountId: "acc-1",
			categoryId: "cat-1",
			costCenterId: "cc-1",
			payerId: "p1",
			paymentMethod: "Pix",
			condition: "À vista",
			amount: 50,
		});
	});

	it("receita não exige centro de custo", () => {
		const draft = applyBulkOverrides(
			makeLine({ type: "receita" }),
			undefined,
			null,
			noOverrides,
		);
		expect(draft?.costCenterId).toBeNull();
	});

	it("linha de cartão usa o cartão vinculado e força a forma de pagamento", () => {
		const draft = applyBulkOverrides(
			makeLine({
				pluggyAccountType: "CREDIT",
				linkedFinancialAccountId: null,
				linkedCardId: "card-1",
				description: "Loja 02/04",
			}),
			undefined,
			null,
			{ ...noOverrides, costCenterId: "cc-1", paymentMethod: "Pix" },
		);
		expect(draft).toMatchObject({
			cardId: "card-1",
			accountId: null,
			paymentMethod: "Cartão de crédito",
			condition: "Parcelado",
			installmentCount: 4,
			startInstallment: 2,
		});
	});

	it("preserva campos de um rascunho existente", () => {
		const existing: LineDraft = {
			transactionType: "Despesa",
			amount: 70,
			name: "Editado",
			purchaseDate: "2026-10-02",
			accountId: "acc-1",
			cardId: null,
			categoryId: "cat-1",
			costCenterId: "cc-1",
			payerId: null,
			paymentMethod: "Pix",
			condition: "À vista",
		};
		const draft = applyBulkOverrides(makeLine(), existing, "p1", {
			...noOverrides,
			categoryId: "cat-2",
		});
		expect(draft).toMatchObject({
			name: "Editado",
			amount: 70,
			categoryId: "cat-2",
		});
	});
});

describe("isDraftComplete", () => {
	it("exige conta para linha de banco", () => {
		const draft = {
			transactionType: "Receita",
			amount: 10,
			name: "x",
			purchaseDate: "2026-10-01",
			accountId: null,
			cardId: null,
			categoryId: "c",
			costCenterId: null,
			payerId: null,
			paymentMethod: "Pix",
			condition: "À vista",
		} satisfies LineDraft;
		expect(isDraftComplete({ pluggyAccountType: "BANK" }, draft)).toBe(false);
	});
});
