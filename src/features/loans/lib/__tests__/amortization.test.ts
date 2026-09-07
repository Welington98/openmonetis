import { describe, expect, it } from "vitest";
import { generateAmortizationSchedule } from "@/features/loans/lib/amortization";

const sumPrincipal = (rows: ReturnType<typeof generateAmortizationSchedule>) =>
	rows.reduce((total, row) => total + row.principalAmountCents, 0);

describe("generateAmortizationSchedule", () => {
	it("returns an empty schedule for zero/negative inputs", () => {
		expect(
			generateAmortizationSchedule({
				principalCents: 100000,
				monthlyRatePercent: 2,
				installmentCount: 0,
				system: "price",
			}),
		).toEqual([]);

		expect(
			generateAmortizationSchedule({
				principalCents: 0,
				monthlyRatePercent: 2,
				installmentCount: 12,
				system: "sac",
			}),
		).toEqual([]);
	});

	describe("Price (parcela fixa)", () => {
		it("splits a zero-interest loan into equal installments with zero interest", () => {
			const rows = generateAmortizationSchedule({
				principalCents: 120000,
				monthlyRatePercent: 0,
				installmentCount: 12,
				system: "price",
			});

			expect(rows).toHaveLength(12);
			for (const row of rows) {
				expect(row.totalAmountCents).toBe(10000);
				expect(row.principalAmountCents).toBe(10000);
				expect(row.interestAmountCents).toBe(0);
			}
			expect(rows.at(-1)?.remainingBalanceAfterCents).toBe(0);
			expect(sumPrincipal(rows)).toBe(120000);
		});

		it("keeps the total installment amount fixed across all but the last row, with declining interest and rising principal", () => {
			const rows = generateAmortizationSchedule({
				principalCents: 100000,
				monthlyRatePercent: 2,
				installmentCount: 6,
				system: "price",
			});

			expect(rows).toHaveLength(6);

			const [first, ...rest] = rows;
			const nonLast = rows.slice(0, -1);
			const allButLastEqual = nonLast.every(
				(row) => row.totalAmountCents === first?.totalAmountCents,
			);
			expect(allButLastEqual).toBe(true);

			for (let i = 1; i < nonLast.length; i += 1) {
				expect(nonLast[i]?.interestAmountCents).toBeLessThan(
					nonLast[i - 1]?.interestAmountCents ?? Number.POSITIVE_INFINITY,
				);
				expect(nonLast[i]?.principalAmountCents).toBeGreaterThan(
					nonLast[i - 1]?.principalAmountCents ?? 0,
				);
			}
			expect(rest).toBeDefined();

			expect(rows.at(-1)?.remainingBalanceAfterCents).toBe(0);
			expect(sumPrincipal(rows)).toBe(100000);
		});
	});

	describe("SAC (amortização constante)", () => {
		it("matches a hand-checkable textbook example (R$1000, 1% a.m., 4x)", () => {
			const rows = generateAmortizationSchedule({
				principalCents: 100000,
				monthlyRatePercent: 1,
				installmentCount: 4,
				system: "sac",
			});

			expect(rows).toEqual([
				{
					installmentNumber: 1,
					totalAmountCents: 26000,
					principalAmountCents: 25000,
					interestAmountCents: 1000,
					remainingBalanceAfterCents: 75000,
				},
				{
					installmentNumber: 2,
					totalAmountCents: 25750,
					principalAmountCents: 25000,
					interestAmountCents: 750,
					remainingBalanceAfterCents: 50000,
				},
				{
					installmentNumber: 3,
					totalAmountCents: 25500,
					principalAmountCents: 25000,
					interestAmountCents: 500,
					remainingBalanceAfterCents: 25000,
				},
				{
					installmentNumber: 4,
					totalAmountCents: 25250,
					principalAmountCents: 25000,
					interestAmountCents: 250,
					remainingBalanceAfterCents: 0,
				},
			]);
		});

		it("keeps principal constant (except rounding remainder on the last row) and total amount declining", () => {
			const rows = generateAmortizationSchedule({
				principalCents: 100001,
				monthlyRatePercent: 1.5,
				installmentCount: 7,
				system: "sac",
			});

			expect(rows).toHaveLength(7);
			const nonLast = rows.slice(0, -1);
			const basePrincipal = nonLast[0]?.principalAmountCents;
			for (const row of nonLast) {
				expect(row.principalAmountCents).toBe(basePrincipal);
			}

			for (let i = 1; i < rows.length; i += 1) {
				expect(rows[i]?.totalAmountCents).toBeLessThan(
					rows[i - 1]?.totalAmountCents ?? Number.POSITIVE_INFINITY,
				);
			}

			expect(rows.at(-1)?.remainingBalanceAfterCents).toBe(0);
			expect(sumPrincipal(rows)).toBe(100001);
		});
	});
});
