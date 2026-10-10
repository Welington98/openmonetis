import { describe, expect, it } from "vitest";
import {
	assignContentOccurrences,
	buildOfxFingerprintPayload,
} from "../ofx-identity";

const row = {
	externalId: null,
	date: "2026-10-13",
	amount: 22.24,
	transactionType: "expense" as const,
	sourceDescription: "Casa Do Oleo (2/4)",
};
const destination = { type: "card" as const, id: "card-1" };

describe("assignContentOccurrences", () => {
	it("numera linhas idênticas e mantém as diferentes em 0", () => {
		const result = assignContentOccurrences([
			row,
			row,
			{ ...row, amount: 10 },
			row,
		]);
		expect(result.map((r) => r.externalIdOccurrence)).toEqual([0, 1, 0, 2]);
	});

	it("não numera linhas com identificador do banco", () => {
		const result = assignContentOccurrences([
			{ ...row, externalId: "A" },
			{ ...row, externalId: "A" },
		]);
		expect(result.map((r) => r.externalIdOccurrence)).toEqual([0, 0]);
	});
});

describe("buildOfxFingerprintPayload sem identificador", () => {
	const build = (
		overrides: Partial<typeof row> & { externalIdOccurrence?: number },
	) =>
		buildOfxFingerprintPayload({
			source: "Itaú",
			accountNumber: null,
			destination,
			row: { ...row, externalIdOccurrence: 0, ...overrides },
		});

	it("é estável para o mesmo conteúdo", () => {
		expect(build({})).toBe(build({}));
		expect(build({})).not.toBeNull();
	});

	it("muda com a parcela, a ocorrência ou o destino", () => {
		expect(build({ sourceDescription: "Casa Do Oleo (3/4)" })).not.toBe(
			build({}),
		);
		expect(build({ externalIdOccurrence: 1 })).not.toBe(build({}));
		expect(
			buildOfxFingerprintPayload({
				source: "Itaú",
				accountNumber: null,
				destination: { type: "card", id: "card-2" },
				row: { ...row, externalIdOccurrence: 0 },
			}),
		).not.toBe(build({}));
	});
});
