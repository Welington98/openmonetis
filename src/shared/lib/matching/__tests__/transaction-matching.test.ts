import { describe, expect, it } from "vitest";
import {
	findMatchCandidates,
	type MatchableTransaction,
	matchLinesToTransactions,
} from "../transaction-matching";

const day = (value: string) => new Date(`${value}T00:00:00`);

const tx = (
	overrides: Partial<MatchableTransaction> & { id: string },
): MatchableTransaction => ({
	name: "Casa do Oleo",
	amount: -22.24,
	purchaseDate: day("2026-10-13"),
	...overrides,
});

describe("findMatchCandidates", () => {
	it("casa valor igual dentro da janela de data", () => {
		const result = findMatchCandidates(
			{ description: "CASA DO OLEO", amount: 22.24, date: day("2026-10-14") },
			[tx({ id: "a" })],
		);
		expect(result.map((r) => r.transactionId)).toEqual(["a"]);
	});

	it("ignora valor diferente, data fora da janela e tipo diferente", () => {
		const line = {
			description: "Casa do Oleo",
			amount: 22.24,
			date: day("2026-10-13"),
			transactionType: "Despesa" as const,
		};
		expect(
			findMatchCandidates(line, [
				tx({ id: "valor", amount: -22.25 }),
				tx({ id: "data", purchaseDate: day("2026-10-20") }),
				tx({ id: "tipo", transactionType: "Receita" }),
			]),
		).toEqual([]);
	});

	it("parcela N/T só casa com a mesma parcela do existente parcelado", () => {
		const line = {
			description: "Casa do Oleo",
			amount: 22.24,
			date: day("2026-11-13"),
			installment: { current: 2, total: 4 },
		};
		const result = findMatchCandidates(line, [
			tx({ id: "p1", installmentCount: 4, currentInstallment: 1 }),
			tx({ id: "p2", installmentCount: 4, currentInstallment: 2 }),
		]);
		expect(result.map((r) => r.transactionId)).toEqual(["p2"]);
	});

	it("linha à vista não casa com lançamento parcelado", () => {
		const result = findMatchCandidates(
			{ description: "Casa do Oleo", amount: 22.24, date: day("2026-10-13") },
			[tx({ id: "p", installmentCount: 4, currentInstallment: 1 })],
		);
		expect(result).toEqual([]);
	});
});

describe("matchLinesToTransactions", () => {
	it("atribui cada lançamento existente a no máximo uma linha", () => {
		const lines = [
			{ description: "Padaria", amount: 10, date: day("2026-10-10") },
			{ description: "Padaria", amount: 10, date: day("2026-10-10") },
		];
		const result = matchLinesToTransactions(lines, [
			tx({
				id: "unico",
				name: "Padaria",
				amount: -10,
				purchaseDate: day("2026-10-10"),
			}),
		]);
		expect(result.filter(Boolean)).toHaveLength(1);
	});

	it("retorna null sem candidato acima do limiar", () => {
		expect(
			matchLinesToTransactions(
				[{ description: "X", amount: 5, date: day("2026-10-10") }],
				[],
			),
		).toEqual([null]);
	});
});
