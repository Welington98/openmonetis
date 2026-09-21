import { describe, expect, it } from "vitest";
import { isInvoiceGroupingEligible } from "../page-helpers";

describe("isInvoiceGroupingEligible", () => {
	it("is eligible when no category, payer, or search filter is active", () => {
		expect(
			isInvoiceGroupingEligible({
				categoryFilters: [],
				payerFilters: [],
				searchFilter: null,
			}),
		).toBe(true);
	});

	it("is not eligible when a category filter is active", () => {
		expect(
			isInvoiceGroupingEligible({
				categoryFilters: ["alimentacao"],
				payerFilters: [],
				searchFilter: null,
			}),
		).toBe(false);
	});

	it("is not eligible when a payer filter is active", () => {
		expect(
			isInvoiceGroupingEligible({
				categoryFilters: [],
				payerFilters: ["joao"],
				searchFilter: null,
			}),
		).toBe(false);
	});

	it("is not eligible when a search filter is active", () => {
		expect(
			isInvoiceGroupingEligible({
				categoryFilters: [],
				payerFilters: [],
				searchFilter: "supermercado",
			}),
		).toBe(false);
	});

	it("is not eligible when every filter is active at once", () => {
		expect(
			isInvoiceGroupingEligible({
				categoryFilters: ["alimentacao"],
				payerFilters: ["joao"],
				searchFilter: "supermercado",
			}),
		).toBe(false);
	});
});
