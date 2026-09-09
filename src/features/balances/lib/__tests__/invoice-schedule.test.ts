import { describe, expect, it } from "vitest";
import { buildCardDueSchedule } from "@/features/balances/lib/invoice-schedule";

describe("buildCardDueSchedule", () => {
	it("clamps a due day of 31 in a 28-day February", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "31",
				period: "2027-02",
				paymentStatus: null,
				adminTotal: 100,
			},
		]);

		expect(schedule.get("2027-02-28")).toBe(100);
	});

	it("clamps a due day of 31 in a leap-year 29-day February", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "31",
				period: "2028-02",
				paymentStatus: null,
				adminTotal: 100,
			},
		]);

		expect(schedule.get("2028-02-29")).toBe(100);
	});

	it("a paid invoice contributes nothing — it already exists as a real settled row baked into the anchor", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: "pago",
				adminTotal: 500,
			},
		]);

		expect(schedule.size).toBe(0);
	});

	it("a partially paid invoice contributes nothing — the remainder already exists as a real carry-over row in the next period", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: "parcial",
				adminTotal: 500,
			},
		]);

		expect(schedule.size).toBe(0);
	});

	it("an installed (parcelada) invoice contributes nothing — the remainder already exists as real installment rows in future periods", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: "parcelado",
				adminTotal: 500,
			},
		]);

		expect(schedule.size).toBe(0);
	});

	it("an invoice with no admin-payer share contributes nothing", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: null,
				adminTotal: 0,
			},
		]);

		expect(schedule.size).toBe(0);
	});

	it("two cards due on the same day sum into one cell", () => {
		const schedule = buildCardDueSchedule([
			{
				cardId: "card-1",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: null,
				adminTotal: 300,
			},
			{
				cardId: "card-2",
				dueDay: "10",
				period: "2026-09",
				paymentStatus: "pendente",
				adminTotal: 150,
			},
		]);

		expect(schedule.get("2026-09-10")).toBe(450);
	});
});
