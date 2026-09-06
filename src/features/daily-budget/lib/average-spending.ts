export type CalculateAverageDailySpendingInput = {
	/** Soma (magnitude positiva) de Despesa com purchaseDate em [cycleStart, hoje]. */
	totalVariableSpentThisCycle: number;
	/** hoje - cycleStart + 1. */
	daysElapsedInCycle: number;
	/** Total de dias do mês corrente — usado só pra pesar o quanto confiar no ritmo atual vs. no histórico. */
	daysInCycle: number;
	/** Média diária de gasto variável de cada um dos últimos meses fechados (0 a N entradas). */
	historicalDailyAverages: number[];
};

export type AverageDailySpendingResult = {
	averageDailySpending: number;
};

/**
 * Média diária gasta = mistura entre o ritmo do mês corrente
 * (gastos_realizados_no_ciclo / dias_decorridos) e a média dos últimos
 * meses — sem histórico, ou perto do fim do mês, o ritmo atual já é
 * confiável sozinho; no início do mês (poucos dias decorridos), um dia
 * atípico isolado distorceria a média sozinha, então pesa mais o
 * histórico. O peso do ritmo atual cresce linearmente com os dias
 * decorridos (dia 1 = 100% histórico, último dia do mês = 100% ritmo
 * atual).
 */
export function calculateAverageDailySpending({
	totalVariableSpentThisCycle,
	daysElapsedInCycle,
	daysInCycle,
	historicalDailyAverages,
}: CalculateAverageDailySpendingInput): AverageDailySpendingResult {
	const currentDailyAverage =
		daysElapsedInCycle > 0
			? totalVariableSpentThisCycle / daysElapsedInCycle
			: 0;

	if (historicalDailyAverages.length === 0) {
		return { averageDailySpending: currentDailyAverage };
	}

	const historicalAverage =
		historicalDailyAverages.reduce((sum, value) => sum + value, 0) /
		historicalDailyAverages.length;

	const currentWeight =
		daysInCycle > 0 ? Math.min(daysElapsedInCycle / daysInCycle, 1) : 0;

	return {
		averageDailySpending:
			currentDailyAverage * currentWeight +
			historicalAverage * (1 - currentWeight),
	};
}
