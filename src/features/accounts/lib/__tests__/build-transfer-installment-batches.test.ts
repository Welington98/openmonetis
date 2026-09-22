import { describe, expect, it } from "vitest";
import { buildTransferInstallmentBatches } from "../build-transfer-installment-batches";

const baseParams = {
	fromAccountId: "acc-from",
	fromAccountName: "Conta Origem",
	toAccountId: "acc-to",
	toAccountName: "Conta Destino",
	amount: 100,
	firstDate: new Date("2026-01-10T00:00:00.000Z"),
	firstPeriod: "2026-01",
	userId: "user-1",
	adminPayerId: "payer-admin",
	transferCategoryId: "cat-transfer",
};

describe("buildTransferInstallmentBatches", () => {
	it("generates a single À vista pair when installmentCount is 1", () => {
		const rows = buildTransferInstallmentBatches({
			...baseParams,
			installmentCount: 1,
		});

		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.condition === "À vista")).toBe(true);
		expect(rows.every((row) => row.seriesId === null)).toBe(true);
		expect(rows.every((row) => row.installmentCount === null)).toBe(true);
		expect(new Set(rows.map((row) => row.transferId)).size).toBe(1);
	});

	it("generates N pairs sharing one seriesId, each pair with its own transferId", () => {
		const rows = buildTransferInstallmentBatches({
			...baseParams,
			installmentCount: 3,
		});

		expect(rows).toHaveLength(6);
		expect(rows.every((row) => row.condition === "Parcelado")).toBe(true);

		const seriesIds = new Set(rows.map((row) => row.seriesId));
		expect(seriesIds.size).toBe(1);
		expect([...seriesIds][0]).not.toBeNull();

		const transferIds = new Set(rows.map((row) => row.transferId));
		expect(transferIds.size).toBe(3);

		expect(rows.map((row) => row.currentInstallment)).toEqual([
			1, 1, 2, 2, 3, 3,
		]);
		expect(rows.every((row) => row.installmentCount === 3)).toBe(true);
	});

	it("steps each installment's date and period by one month", () => {
		const rows = buildTransferInstallmentBatches({
			...baseParams,
			installmentCount: 3,
		});

		const periods = rows.filter((_, i) => i % 2 === 0).map((row) => row.period);
		expect(periods).toEqual(["2026-01", "2026-02", "2026-03"]);

		const purchaseDates = rows
			.filter((_, i) => i % 2 === 0)
			.map((row) => (row.purchaseDate as Date).toISOString().slice(0, 10));
		expect(purchaseDates).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
	});

	it("keeps the outgoing leg negative and the incoming leg positive for every installment", () => {
		const rows = buildTransferInstallmentBatches({
			...baseParams,
			installmentCount: 2,
		});

		const outgoingLegs = rows.filter(
			(row) => row.accountId === baseParams.fromAccountId,
		);
		const incomingLegs = rows.filter(
			(row) => row.accountId === baseParams.toAccountId,
		);

		expect(outgoingLegs.every((row) => Number(row.amount) === -100)).toBe(true);
		expect(incomingLegs.every((row) => Number(row.amount) === 100)).toBe(true);
	});
});
