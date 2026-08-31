export type CalculateAverageDailySpendingInput = {
	/** Soma (magnitude positiva) de Despesa com purchaseDate em [cycleStart, hoje]. */
	totalVariableSpentThisCycle: number;
	/** hoje - cycleStart + 1. */
	daysElapsedInCycle: number;
};

export type AverageDailySpendingResult = {
	averageDailySpending: number;
};

/** Média diária gasta = gastos_realizados_no_ciclo / dias_decorridos. */
export function calculateAverageDailySpending({
	totalVariableSpentThisCycle,
	daysElapsedInCycle,
}: CalculateAverageDailySpendingInput): AverageDailySpendingResult {
	if (daysElapsedInCycle <= 0) {
		return { averageDailySpending: 0 };
	}

	return {
		averageDailySpending: totalVariableSpentThisCycle / daysElapsedInCycle,
	};
}
