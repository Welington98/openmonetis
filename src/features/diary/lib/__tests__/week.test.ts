import { describe, expect, it } from "vitest";
import {
	addDays,
	addWeeks,
	getIsoWeekLabel,
	getWeekDays,
	getWeekStart,
} from "@/features/diary/lib/week";

describe("getWeekStart", () => {
	it("returns the same date when it's already a Monday", () => {
		expect(getWeekStart("2026-08-24")).toBe("2026-08-24");
	});

	it("returns the preceding Monday for a mid-week date", () => {
		expect(getWeekStart("2026-08-27")).toBe("2026-08-24"); // quinta-feira
	});

	it("returns the preceding Monday for a Sunday", () => {
		expect(getWeekStart("2026-08-30")).toBe("2026-08-24");
	});

	it("handles a week that crosses a month boundary", () => {
		expect(getWeekStart("2026-09-01")).toBe("2026-08-31"); // terça-feira
	});
});

describe("getWeekDays", () => {
	it("returns the 7 days from Monday to Sunday", () => {
		expect(getWeekDays("2026-08-24")).toEqual([
			"2026-08-24",
			"2026-08-25",
			"2026-08-26",
			"2026-08-27",
			"2026-08-28",
			"2026-08-29",
			"2026-08-30",
		]);
	});
});

describe("addDays / addWeeks", () => {
	it("adds and subtracts days across a month boundary", () => {
		expect(addDays("2026-08-30", 1)).toBe("2026-08-31");
		expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
		expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
	});

	it("adds and subtracts whole weeks", () => {
		expect(addWeeks("2026-08-24", 1)).toBe("2026-08-31");
		expect(addWeeks("2026-08-24", -1)).toBe("2026-08-17");
	});
});

describe("getIsoWeekLabel", () => {
	it("labels a date in the middle of the year", () => {
		expect(getIsoWeekLabel("2026-08-30")).toBe("2026-W35");
	});

	it("labels the same ISO week consistently for every day in it", () => {
		for (const day of [
			"2026-08-24",
			"2026-08-25",
			"2026-08-26",
			"2026-08-27",
			"2026-08-28",
			"2026-08-29",
			"2026-08-30",
		]) {
			expect(getIsoWeekLabel(day)).toBe("2026-W35");
		}
	});

	it("attributes the last days of December to next year's week 1 when applicable", () => {
		// 2026-12-31 é quinta-feira -> semana 1 de 2026? checar regra ISO:
		// a semana que contém a primeira quinta do ano é a semana 1.
		// 2026-12-28 (segunda) .. 2027-01-03 (domingo) contém 2026-12-31 (quinta)
		// e também 2027-01-01, então essa semana pertence a 2026 (ISO).
		expect(getIsoWeekLabel("2026-12-31")).toBe("2026-W53");
	});
});
