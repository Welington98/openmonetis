import { describe, expect, it } from "vitest";
import {
	type BalanceDayMovement,
	generateBalanceProjection,
} from "@/features/balances/lib/balance-projection";

const movement = (
	overrides: Partial<BalanceDayMovement> & { date: string },
) => ({
	income: 0,
	fixedExpenses: 0,
	variableExpenses: 0,
	savings: 0,
	cardDue: 0,
	...overrides,
});

describe("generateBalanceProjection", () => {
	it("matches the reference spreadsheet formula: balance[d] = balance[d-1] + entradas - saídas - diários - economias - cartão", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-14",
			windowEnd: "2026-08-15",
			today: "2026-08-20",
			anchorBalance: 1599.06,
			settledNetByDate: new Map(),
			movements: [
				movement({
					date: "2026-08-15",
					fixedExpenses: 250.11,
					variableExpenses: 65,
				}),
			],
			dailyAllowance: 0,
		});

		expect(result.startingBalance).toBe(1599.06);
		expect(result.rows[0]?.balance).toBe(1599.06);
		expect(result.rows[1]?.balance).toBeCloseTo(1283.95, 2);
	});

	it("carries the balance across a month boundary — the opposite of daily-projection.test.ts, which asserts each month resets to its own budget for the OTHER (budget-countdown) feature; do not make these two agree", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-31",
			windowEnd: "2026-09-02",
			today: "2026-08-31",
			anchorBalance: 100,
			settledNetByDate: new Map(),
			movements: [movement({ date: "2026-09-01", fixedExpenses: 40 })],
			dailyAllowance: 0,
		});

		expect(result.rows.map((row) => row.balance)).toEqual([100, 60, 60]);
	});

	it("starting balance equals the anchor when the window is entirely in the future and nothing is settled after today", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-09-01",
			windowEnd: "2026-09-01",
			today: "2026-08-01",
			anchorBalance: 500,
			settledNetByDate: new Map([["2026-07-15", -50]]),
			movements: [],
			dailyAllowance: 0,
		});

		expect(result.startingBalance).toBe(500);
	});

	it("undoes a settled row dated after the window end, even though it's never re-applied", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-01",
			windowEnd: "2026-08-05",
			today: "2026-08-01",
			// anchor already includes a settled +1000 dated 2026-12-25 (post-dated, marked realizado)
			anchorBalance: 1000,
			settledNetByDate: new Map([["2026-12-25", 1000]]),
			movements: [],
			dailyAllowance: 0,
		});

		expect(result.startingBalance).toBe(0);
		expect(result.rows.every((row) => row.balance === 0)).toBe(true);
	});

	it("reproduces a known historical balance when the window is entirely in the past", () => {
		// anchor (hoje) = 1000; entre 2026-06-10 (windowEnd) e hoje, sabemos que
		// entrou +1000 (net) em 2026-07-01 — logo em 2026-06-10 o saldo era 0.
		const result = generateBalanceProjection({
			windowStart: "2026-06-01",
			windowEnd: "2026-06-10",
			today: "2026-08-01",
			anchorBalance: 1000,
			settledNetByDate: new Map([["2026-07-01", 1000]]),
			movements: [],
			dailyAllowance: 0,
		});

		expect(result.startingBalance).toBe(0);
	});

	it("suppresses the daily allowance on a future day that already has a materialized variável expense", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-25",
			windowEnd: "2026-08-25",
			today: "2026-08-24",
			anchorBalance: 0,
			settledNetByDate: new Map(),
			movements: [movement({ date: "2026-08-25", variableExpenses: 120 })],
			dailyAllowance: 35,
		});

		expect(result.rows[0]?.daily).toBe(120);
	});

	it("applies the daily allowance on a future day with only a fixa expense (fixa never suppresses it)", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-25",
			windowEnd: "2026-08-25",
			today: "2026-08-24",
			anchorBalance: 0,
			settledNetByDate: new Map(),
			movements: [movement({ date: "2026-08-25", fixedExpenses: 900 })],
			dailyAllowance: 35,
		});

		expect(result.rows[0]?.daily).toBe(35);
		expect(result.rows[0]?.expenses).toBe(900);
	});

	it("never applies the daily allowance on d <= hoje, even with zero real variável spend", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-24",
			windowEnd: "2026-08-24",
			today: "2026-08-24",
			anchorBalance: 0,
			settledNetByDate: new Map(),
			movements: [],
			dailyAllowance: 35,
		});

		expect(result.rows[0]?.daily).toBe(0);
	});

	it("returns a flat line with no NaN for an empty month", () => {
		const result = generateBalanceProjection({
			windowStart: "2026-08-01",
			windowEnd: "2026-08-03",
			today: "2026-08-15",
			anchorBalance: 250,
			settledNetByDate: new Map(),
			movements: [],
			dailyAllowance: 0,
		});

		expect(result.rows.every((row) => row.balance === 250)).toBe(true);
		expect(result.rows.every((row) => !Number.isNaN(row.balance))).toBe(true);
	});
});
