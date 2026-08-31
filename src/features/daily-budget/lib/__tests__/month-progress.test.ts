import { describe, expect, it } from "vitest";
import { calculateMonthProgress } from "@/features/daily-budget/lib/month-progress";

describe("calculateMonthProgress", () => {
	it("computes elapsed/remaining days for a mid-month date", () => {
		const result = calculateMonthProgress({ today: "2026-08-10" });

		expect(result.period).toBe("2026-08");
		expect(result.daysInMonth).toBe(31);
		expect(result.daysElapsed).toBe(10);
		expect(result.daysRemaining).toBe(22);
	});

	it("returns daysRemaining = 1 on the last day of the month", () => {
		const result = calculateMonthProgress({ today: "2026-08-31" });

		expect(result.daysRemaining).toBe(1);
		expect(result.daysElapsed).toBe(31);
	});

	it("returns daysRemaining = full month on the first day", () => {
		const result = calculateMonthProgress({ today: "2026-09-01" });

		expect(result.period).toBe("2026-09");
		expect(result.daysInMonth).toBe(30);
		expect(result.daysElapsed).toBe(1);
		expect(result.daysRemaining).toBe(30);
	});

	it("handles February in a leap year", () => {
		const result = calculateMonthProgress({ today: "2028-02-15" });

		expect(result.daysInMonth).toBe(29);
	});
});
