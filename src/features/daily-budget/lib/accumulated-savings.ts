export type CalculateAccumulatedSavingsInput = {
	/** Cota diária de hoje (`calculateDailyBudget().dailyBudgetAmount`). */
	dailyBudgetAmount: number;
	/** Dias já decorridos no mês, incluindo hoje. */
	daysElapsed: number;
	/** Gasto variável real desde o início do mês até hoje (magnitude positiva). */
	variableSpentSoFar: number;
};

export type AccumulatedSavingsResult = {
	/** Positivo = gastou menos que o ritmo da cota até agora (economizou). Negativo = já furou o ritmo acumulado. */
	accumulatedSavings: number;
};

/**
 * Sobra acumulada = (cota de hoje × dias decorridos) - gasto variável real
 * até hoje.
 *
 * É uma aproximação: usa a cota de HOJE como referência de "ritmo ideal"
 * pros dias que já passaram, já que não existe uma cota diária histórica
 * guardada (ela é recalculada a cada acesso). Mesmo assim, dá o número que
 * falta pro usuário: "nesse ritmo, você guardou R$X até agora" — sem isso,
 * a folga só existe embutida no saldo disponível, invisível pro usuário.
 */
export function calculateAccumulatedSavings({
	dailyBudgetAmount,
	daysElapsed,
	variableSpentSoFar,
}: CalculateAccumulatedSavingsInput): AccumulatedSavingsResult {
	const idealSpendSoFar = dailyBudgetAmount * Math.max(daysElapsed, 0);

	return {
		accumulatedSavings: idealSpendSoFar - variableSpentSoFar,
	};
}
