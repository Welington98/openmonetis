import { describe, expect, it } from "vitest";
import {
	MANUAL_GROUPS,
	MANUAL_SECTIONS,
} from "@/features/manual/lib/manual-content";

describe("manual content", () => {
	it("has unique section ids", () => {
		const ids = MANUAL_SECTIONS.map((section) => section.id);

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("only uses known groups and fills title and summary", () => {
		for (const section of MANUAL_SECTIONS) {
			expect(MANUAL_GROUPS).toContain(section.group);
			expect(section.title.length).toBeGreaterThan(0);
			expect(section.summary.length).toBeGreaterThan(0);
		}
	});

	it("only links to internal routes", () => {
		for (const section of MANUAL_SECTIONS) {
			if (section.href) {
				expect(section.href.startsWith("/")).toBe(true);
			}
		}
	});
});
