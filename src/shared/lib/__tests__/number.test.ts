import { describe, expect, it } from "vitest";
import { parseLocalizedNumber } from "@/shared/utils/number";

describe("parseLocalizedNumber", () => {
	it("lê formato pt-BR com milhar", () => {
		expect(parseLocalizedNumber("1.234,56")).toBe(1234.56);
		expect(parseLocalizedNumber("R$ 12.345,67")).toBe(12345.67);
		expect(parseLocalizedNumber("1.234.567,89")).toBe(1234567.89);
	});

	it("lê formato US com milhar", () => {
		expect(parseLocalizedNumber("1,234.56")).toBe(1234.56);
	});

	it("lê decimais simples", () => {
		expect(parseLocalizedNumber("12,5")).toBe(12.5);
		expect(parseLocalizedNumber("12.5")).toBe(12.5);
		expect(parseLocalizedNumber("1234")).toBe(1234);
	});

	it("preserva o sinal negativo", () => {
		expect(parseLocalizedNumber("-1.234,56")).toBe(-1234.56);
		expect(parseLocalizedNumber("R$ -50,00")).toBe(-50);
	});

	it("retorna null sem valor numérico", () => {
		expect(parseLocalizedNumber("abc")).toBeNull();
		expect(parseLocalizedNumber("")).toBeNull();
	});
});
