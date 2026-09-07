/** Converte um valor decimal (reais) pra centavos inteiros. */
export function toCents(value: number): number {
	return Math.round(value * 100);
}

/** Converte centavos inteiros de volta pra string decimal (2 casas) pro banco. */
export function centsToDecimalString(cents: number): string {
	const decimal = cents / 100;
	const formatted = decimal.toFixed(2);
	return Object.is(decimal, -0) ? "0.00" : formatted;
}
