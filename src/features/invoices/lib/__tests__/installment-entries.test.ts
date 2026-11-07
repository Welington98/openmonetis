import { describe, expect, it } from "vitest";
import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	CARRY_OVER_NOTE_PREFIX,
	INSTALLMENT_INVOICE_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";
import { generateAmortizationSchedule } from "@/shared/lib/amortization";
import { buildInstallmentInvoiceEntries } from "../installment-entries";

const CARD = "card-1";
const PERIOD = "2026-11";

const build = (monthlyRatePercent: number) => {
	const schedule = generateAmortizationSchedule({
		principalCents: 100_000,
		monthlyRatePercent,
		installmentCount: 4,
		system: "price",
	});
	return {
		schedule,
		entries: buildInstallmentInvoiceEntries({
			cardId: CARD,
			period: PERIOD,
			installmentCount: 4,
			schedule,
		}),
	};
};

describe("buildInstallmentInvoiceEntries", () => {
	it("separa principal e juros e a soma bate com a tabela de amortização", () => {
		const { schedule, entries } = build(3);

		const principal = entries.filter((e) => e.kind === "principal");
		const interest = entries.filter((e) => e.kind === "interest");

		expect(principal).toHaveLength(4);
		expect(interest).toHaveLength(4);
		expect(principal.reduce((s, e) => s + e.amountCents, 0)).toBe(100_000);
		expect(entries.reduce((s, e) => s + e.amountCents, 0)).toBe(
			schedule.reduce((s, r) => s + r.totalAmountCents, 0),
		);
	});

	it("o juros total é maior que zero quando há taxa (o custo que sumia das despesas)", () => {
		const { entries } = build(3);
		const interestTotal = entries
			.filter((e) => e.kind === "interest")
			.reduce((s, e) => s + e.amountCents, 0);
		expect(interestTotal).toBeGreaterThan(0);
	});

	it("sem taxa não cria lançamentos de juros", () => {
		const { entries } = build(0);
		expect(entries.every((e) => e.kind === "principal")).toBe(true);
		expect(entries).toHaveLength(4);
	});

	it("cada parcela cai na fatura do mês seguinte em sequência", () => {
		const { entries } = build(3);
		const periods = entries
			.filter((e) => e.kind === "principal")
			.map((e) => e.period);
		expect(periods).toEqual(["2026-12", "2027-01", "2027-02", "2027-03"]);
	});

	it("notas de juros são únicas e não caem nos filtros que excluem liquidação de fatura", () => {
		const { entries } = build(3);
		const notes = entries.map((e) => e.note);
		expect(new Set(notes).size).toBe(notes.length);

		const excluded = [
			ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
			CARRY_OVER_NOTE_PREFIX,
			INSTALLMENT_INVOICE_NOTE_PREFIX,
		];
		for (const e of entries.filter((x) => x.kind === "interest")) {
			expect(excluded.some((p) => e.note.startsWith(p))).toBe(false);
		}
		for (const e of entries.filter((x) => x.kind === "principal")) {
			expect(e.note.startsWith(INSTALLMENT_INVOICE_NOTE_PREFIX)).toBe(true);
		}
	});
});
