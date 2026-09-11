import { describe, expect, it } from "vitest";
import { buildTransactionRecords } from "../../actions/core";

const baseData = {
	name: "Financiamento",
	purchaseDate: "2026-01-10",
	transactionType: "Despesa" as const,
	paymentMethod: "Boleto" as const,
	note: null,
	accountId: "acc-1",
	cardId: null,
	categoryId: "cat-1",
	costCenterId: null,
	isSplit: false,
	isSettled: false,
};

describe("buildTransactionRecords", () => {
	it("steps installments by the configured interval (months)", () => {
		const records = buildTransactionRecords({
			data: {
				...baseData,
				condition: "Parcelado",
				amount: 300,
				installmentCount: 3,
				startInstallment: 1,
				installmentInterval: 2,
			},
			userId: "user-1",
			period: "2026-01",
			purchaseDate: new Date("2026-01-10T00:00:00.000Z"),
			dueDate: new Date("2026-01-10T00:00:00.000Z"),
			boletoPaymentDate: null,
			shares: [{ payerId: "payer-1", amountCents: 30000 }],
			amountSign: -1,
			shouldNullifySettled: false,
			seriesId: "series-1",
		});

		expect(records.map((r) => r.period)).toEqual([
			"2026-01",
			"2026-03",
			"2026-05",
		]);
		expect(records.map((r) => r.currentInstallment)).toEqual([1, 2, 3]);
		expect(records.map((r) => r.installmentIntervalMonths)).toEqual([2, 2, 2]);
		// R$ 300 / 3 = R$ 100 per installment, no remainder
		expect(records.map((r) => r.amount)).toEqual([
			"-100.00",
			"-100.00",
			"-100.00",
		]);
	});

	it("defaults to a monthly interval when none is provided", () => {
		const records = buildTransactionRecords({
			data: {
				...baseData,
				condition: "Parcelado",
				amount: 300,
				installmentCount: 3,
				startInstallment: 1,
			},
			userId: "user-1",
			period: "2026-01",
			purchaseDate: new Date("2026-01-10T00:00:00.000Z"),
			dueDate: null,
			boletoPaymentDate: null,
			shares: [{ payerId: "payer-1", amountCents: 30000 }],
			amountSign: -1,
			shouldNullifySettled: false,
			seriesId: "series-1",
		});

		expect(records.map((r) => r.period)).toEqual([
			"2026-01",
			"2026-02",
			"2026-03",
		]);
	});

	it("steps a fixed (Fixa) series by the configured interval", () => {
		const records = buildTransactionRecords({
			data: {
				...baseData,
				condition: "Fixa",
				amount: 100,
				recurrenceCount: 3,
				installmentInterval: 3,
			},
			userId: "user-1",
			period: "2026-01",
			purchaseDate: new Date("2026-01-10T00:00:00.000Z"),
			dueDate: null,
			boletoPaymentDate: null,
			shares: [{ payerId: "payer-1", amountCents: 10000 }],
			amountSign: -1,
			shouldNullifySettled: false,
			seriesId: "series-2",
		});

		expect(records.map((r) => r.period)).toEqual([
			"2026-01",
			"2026-04",
			"2026-07",
		]);
		expect(
			records.map((r) => r.purchaseDate.toISOString().slice(0, 10)),
		).toEqual(["2026-01-10", "2026-04-10", "2026-07-10"]);
	});
});
