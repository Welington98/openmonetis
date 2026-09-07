import { describe, expect, it } from "vitest";
import {
	getBalanceCellTone,
	getBalanceTextClass,
	getBalanceTone,
} from "@/features/balances/lib/balance-tone";

describe("getBalanceTone", () => {
	it("is danger for a balance negative beyond the threshold", () => {
		expect(getBalanceTone(-1000.01, 1000)).toBe("danger");
	});

	it("is attention for a mildly negative balance within the threshold", () => {
		expect(getBalanceTone(-0.01, 1000)).toBe("attention");
		expect(getBalanceTone(-1000, 1000)).toBe("attention");
	});

	it("is warning below the threshold but not negative", () => {
		expect(getBalanceTone(0, 1000)).toBe("warning");
		expect(getBalanceTone(500, 1000)).toBe("warning");
	});

	it("is success at or above the threshold", () => {
		expect(getBalanceTone(1000, 1000)).toBe("success");
	});
});

describe("getBalanceCellTone", () => {
	it("uses a pastel green background for a comfortable balance, regardless of how far above the threshold it is", () => {
		expect(getBalanceCellTone(1100, 1000)).toEqual({
			background: "bg-success/15",
			text: "text-success",
		});
		expect(getBalanceCellTone(1_000_000, 1000)).toEqual({
			background: "bg-success/15",
			text: "text-success",
		});
	});

	it("uses pastel yellow for a positive balance below the threshold", () => {
		expect(getBalanceCellTone(500, 1000)).toEqual({
			background: "bg-warning/15",
			text: "text-warning",
		});
	});

	it("uses pastel pink for a mildly negative balance", () => {
		expect(getBalanceCellTone(-100, 1000)).toEqual({
			background: "bg-chart-5/15",
			text: "text-chart-5",
		});
	});

	it("uses pastel red for a balance negative beyond the threshold, regardless of how extreme", () => {
		expect(getBalanceCellTone(-9800, 1000)).toEqual({
			background: "bg-destructive/15",
			text: "text-destructive",
		});
		expect(getBalanceCellTone(-1_000_000, 1000)).toEqual({
			background: "bg-destructive/15",
			text: "text-destructive",
		});
	});
});

describe("getBalanceTextClass", () => {
	it("returns tinted text matching each tone, for use without a background", () => {
		expect(getBalanceTextClass(1100, 1000)).toBe("text-success");
		expect(getBalanceTextClass(500, 1000)).toBe("text-warning");
		expect(getBalanceTextClass(-100, 1000)).toBe("text-chart-5");
		expect(getBalanceTextClass(-9800, 1000)).toBe("text-destructive");
	});
});
