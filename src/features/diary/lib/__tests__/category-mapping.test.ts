import { describe, expect, it } from "vitest";
import { mapDiaryCategoryToLabel } from "@/features/diary/lib/category-mapping";

describe("mapDiaryCategoryToLabel", () => {
	it("maps each fixed diary category to its real category label", () => {
		expect(mapDiaryCategoryToLabel("alimentacao")).toBe("Alimentação");
		expect(mapDiaryCategoryToLabel("transporte")).toBe("Transporte");
		expect(mapDiaryCategoryToLabel("lazer")).toBe("Lazer");
		expect(mapDiaryCategoryToLabel("contas")).toBe("Contas");
	});

	it("never attempts to map 'outro'", () => {
		expect(mapDiaryCategoryToLabel("outro")).toBeNull();
	});

	it("returns null for null input", () => {
		expect(mapDiaryCategoryToLabel(null)).toBeNull();
	});
});
