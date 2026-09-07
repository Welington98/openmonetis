import { describe, expect, it } from "vitest";
import {
	getBalanceCellTone,
	getBalanceTone,
} from "@/features/balances/lib/balance-tone";

describe("getBalanceTone", () => {
	it("is danger for any negative balance", () => {
		expect(getBalanceTone(-0.01, 1000)).toBe("danger");
	});

	it("is warning below the threshold but not negative", () => {
		expect(getBalanceTone(500, 1000)).toBe("warning");
	});

	it("is success at or above the threshold", () => {
		expect(getBalanceTone(1000, 1000)).toBe("success");
	});
});

describe("getBalanceCellTone", () => {
	it("uses tinted text on a faint background for a balance close to zero relative to the reference", () => {
		const tone = getBalanceCellTone(1100, 1000, 10000);

		expect(tone.background).toBe("bg-success/15");
		expect(tone.text).toBe("text-success");
		expect(tone.isSolid).toBe(false);
	});

	it("switches to foreground-contrast text on a solid background for an extreme balance", () => {
		const tone = getBalanceCellTone(-9800, 1000, 10000);

		expect(tone.background).toBe("bg-destructive");
		expect(tone.text).toBe("text-destructive-foreground");
		expect(tone.isSolid).toBe(true);
	});

	it("never crashes with a zero reference magnitude", () => {
		const tone = getBalanceCellTone(500, 1000, 0);

		expect(tone.background).toMatch(/^bg-/);
		expect(tone.text).toMatch(/^text-/);
	});
});
