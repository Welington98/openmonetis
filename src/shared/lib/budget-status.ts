export type BudgetStatusColor = "green" | "yellow" | "red";

export type BudgetStatusThresholds = {
	/** % mínima pra "green" (ex: 20 = 20%). */
	greenThresholdPct: number;
	/** % mínima pra "yellow" (abaixo disso é "red"). */
	yellowThresholdPct: number;
};

/**
 * Classifica uma porcentagem (ex: saldo projetado como % da renda) em
 * verde/amarelo/vermelho, com faixas configuráveis — não hardcoded, sempre
 * recebidas de userPreferences pelo caller.
 */
export function resolveBudgetStatusColor(
	percentage: number,
	{ greenThresholdPct, yellowThresholdPct }: BudgetStatusThresholds,
): BudgetStatusColor {
	if (percentage >= greenThresholdPct) return "green";
	if (percentage >= yellowThresholdPct) return "yellow";
	return "red";
}
