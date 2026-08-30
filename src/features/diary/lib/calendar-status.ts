export type DiaryDayStatus = "green" | "yellow" | "red" | "gray";

export type DiaryDayStatusEntry = {
	entryDate: string; // YYYY-MM-DD
	hadExpense: boolean;
	amount: number | null;
};

export type ComputeDayStatusesInput = {
	/** Todos os dias do período (mês ou semana), em ordem crescente, "YYYY-MM-DD". */
	daysInPeriod: string[];
	/** Registros do diário nesse período (qualquer ordem). */
	entries: DiaryDayStatusEntry[];
	/** Média móvel de gasto diário dos últimos 30 dias; null se não há dado. */
	rollingAverageDailySpend: number | null;
	/** Limite único de gasto por dia definido pelo usuário; null = sem limite. */
	dailyBudgetAmount: number | null;
	/** Soma dos orçamentos mensais do usuário para o período; null se não há orçamento. */
	monthlyBudgetTotal: number | null;
};

/**
 * Calcula o status visual (verde/amarelo/vermelho/cinza) de cada dia do período.
 *
 * Regras (nesta ordem de prioridade, por dia):
 * 1. Sem check-in nesse dia -> cinza.
 * 2. Check-in sem gasto -> verde, incondicionalmente.
 * 3. Check-in com gasto:
 *    - Se há orçamento diário definido, ele decide o vermelho sozinho (gasto
 *      do dia > limite diário), sem acumular nada — substitui a regra abaixo.
 *    - Senão (fallback): acumula no total do período (cumulativeExpense) e,
 *      se há orçamento mensal E o acumulado ultrapassa esse orçamento, vermelho.
 *    - Em qualquer um dos dois casos, se não deu vermelho e há média móvel E
 *      o gasto do dia é maior que ela -> amarelo.
 *    - Senão -> verde (inclui o caso de não haver média ainda).
 */
export function computeDayStatuses(
	input: ComputeDayStatusesInput,
): Record<string, DiaryDayStatus> {
	const {
		daysInPeriod,
		entries,
		rollingAverageDailySpend,
		dailyBudgetAmount,
		monthlyBudgetTotal,
	} = input;

	const entriesByDate = new Map<string, DiaryDayStatusEntry>();
	for (const entry of entries) {
		entriesByDate.set(entry.entryDate, entry);
	}

	const statuses: Record<string, DiaryDayStatus> = {};
	let cumulativeExpense = 0;

	for (const dateStr of daysInPeriod) {
		const entry = entriesByDate.get(dateStr);

		if (!entry) {
			statuses[dateStr] = "gray";
			continue;
		}

		const dayExpense = entry.hadExpense ? (entry.amount ?? 0) : 0;

		if (dayExpense <= 0) {
			statuses[dateStr] = "green";
			continue;
		}

		let isOverBudget: boolean;
		if (dailyBudgetAmount !== null) {
			isOverBudget = dayExpense > dailyBudgetAmount;
		} else {
			cumulativeExpense += dayExpense;
			isOverBudget =
				monthlyBudgetTotal !== null && cumulativeExpense > monthlyBudgetTotal;
		}

		if (isOverBudget) {
			statuses[dateStr] = "red";
		} else if (
			rollingAverageDailySpend !== null &&
			dayExpense > rollingAverageDailySpend
		) {
			statuses[dateStr] = "yellow";
		} else {
			statuses[dateStr] = "green";
		}
	}

	return statuses;
}
