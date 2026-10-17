/**
 * Utility functions for safe number conversions and formatting
 */

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely converts unknown value to number
 * @param value - Value to convert
 * @param defaultValue - Default value if conversion fails
 * @returns Converted number or default value
 */
export function safeToNumber(value: unknown, defaultValue: number = 0): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? defaultValue : parsed;
	}

	if (value === null || value === undefined) {
		return defaultValue;
	}

	const parsed = Number(value);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Converte texto monetário (pt-BR ou US) em número. O último separador
 * encontrado é o decimal e o outro é milhar: "1.234,56" e "1,234.56" viram
 * 1234.56. Com um único tipo de separador, vírgula é decimal ("12,5") e
 * ponto repetido é milhar ("1.234.567"); ponto único é decimal ("12.5").
 * @returns O número, ou null se não houver valor numérico
 */
export function parseLocalizedNumber(raw: string): number | null {
	const cleaned = raw.replace(/[^\d.,-]/g, "");
	const isNegative = cleaned.startsWith("-");
	const unsigned = cleaned.replace(/-/g, "");
	const lastComma = unsigned.lastIndexOf(",");
	const lastDot = unsigned.lastIndexOf(".");

	let normalized: string;
	if (lastComma !== -1 && lastDot !== -1) {
		const decimalIndex = Math.max(lastComma, lastDot);
		normalized = `${unsigned.slice(0, decimalIndex).replace(/[.,]/g, "")}.${unsigned.slice(decimalIndex + 1)}`;
	} else if (lastComma !== -1) {
		const commaCount = unsigned.split(",").length - 1;
		normalized =
			commaCount > 1 ? unsigned.replace(/,/g, "") : unsigned.replace(",", ".");
	} else {
		const dotCount = unsigned.split(".").length - 1;
		normalized = dotCount > 1 ? unsigned.replace(/\./g, "") : unsigned;
	}

	const value = Number.parseFloat(normalized);
	if (Number.isNaN(value)) {
		return null;
	}
	return isNegative ? -value : value;
}
