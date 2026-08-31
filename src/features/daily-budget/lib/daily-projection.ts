import { addDays, compareDateOnly } from "@/shared/utils/date";

export type DailyProjectionDayInput = {
	date: string; // "YYYY-MM-DD"
	/** Magnitude positiva de Receita conhecida nesse dia (informativo — não afeta o orçamento restante). */
	income: number;
	/** Magnitude positiva de Despesa já materializada nesse dia (recorrência, parcela, etc). */
	expenses: number;
};

export type MonthProjectionInput = {
	/** "YYYY-MM". */
	period: string;
	/** "YYYY-MM-DD" — primeiro dia do mês. */
	monthStart: string;
	/** "YYYY-MM-DD" — último dia do mês. */
	monthEnd: string;
	/** "YYYY-MM-DD", hoje. */
	today: string;
	/** Orçamento total do mês (soma dos orçamentos criados nesse período). */
	monthlyBudgetTotal: number;
	/** Orçamento diário de referência, exibido na coluna — constante ao longo do mês. */
	dailyBudgetAmount: number;
	/** 1 entrada por dia com movimentação real/já materializada conhecida. Dias sem entrada = nenhuma movimentação conhecida. */
	daysWithKnownData: DailyProjectionDayInput[];
	/** true quando esse mês não tem orçamento próprio — usando o total do mês corrente como estimativa. */
	isEstimated: boolean;
};

export type DailyProjectionRow = {
	date: string;
	income: number;
	expenses: number;
	dailyBudget: number;
	/** Quanto resta do orçamento mensal até esse dia (inclusive). */
	remainingBudget: number;
};

export type MonthProjectionResult = {
	period: string;
	isEstimated: boolean;
	days: DailyProjectionRow[];
};

export type GenerateMultiMonthProjectionInput = {
	months: MonthProjectionInput[];
};

export type MultiMonthProjectionResult = {
	months: MonthProjectionResult[];
};

/**
 * Gera a tabela dia-a-dia de UM mês. `remainingBudget` começa em
 * `monthlyBudgetTotal` no dia 1 e só diminui (renda não entra — é só
 * informativa, por decisão do usuário: o orçamento é um plano, não depende
 * de quando o dinheiro chega). Dias <= hoje usam gasto REAL já lançado;
 * dias > hoje usam despesa futura já materializada nesse dia quando existir
 * (recorrência/parcela — evita contar duas vezes), senão assumem
 * dailyBudgetAmount como gasto flexível estimado.
 */
function generateMonthProjection({
	period,
	monthStart,
	monthEnd,
	today,
	monthlyBudgetTotal,
	dailyBudgetAmount,
	daysWithKnownData,
	isEstimated,
}: MonthProjectionInput): MonthProjectionResult {
	const knownByDate = new Map(
		daysWithKnownData.map((entry) => [entry.date, entry]),
	);

	const days: DailyProjectionRow[] = [];
	let remainingBudget = monthlyBudgetTotal;

	for (
		let date = monthStart;
		compareDateOnly(date, monthEnd) <= 0;
		date = addDays(date, 1)
	) {
		const known = knownByDate.get(date);
		const isFuture = compareDateOnly(date, today) > 0;

		const income = known?.income ?? 0;
		const expenses = isFuture
			? known && known.expenses > 0
				? known.expenses
				: dailyBudgetAmount
			: (known?.expenses ?? 0);

		remainingBudget -= expenses;

		days.push({
			date,
			income,
			expenses,
			dailyBudget: dailyBudgetAmount,
			remainingBudget,
		});
	}

	return { period, isEstimated, days };
}

/** Gera a projeção pro mês corrente + os meses futuros passados em `months`, em ordem. */
export function generateMultiMonthProjection({
	months,
}: GenerateMultiMonthProjectionInput): MultiMonthProjectionResult {
	return { months: months.map(generateMonthProjection) };
}
