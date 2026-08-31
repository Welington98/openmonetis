import {
	type BudgetStatusColor,
	resolveBudgetStatusColor,
} from "@/shared/lib/budget-status";

export type EvaluateBudgetStatusInput = {
	/** Inclui hoje. */
	daysElapsed: number;
	daysInMonth: number;
	monthlyBudgetTotal: number;
	/** Magnitude positiva de Despesa já lançada no mês, purchaseDate <= hoje. */
	spentThisMonth: number;
	greenThresholdPct: number;
	yellowThresholdPct: number;
};

export type BudgetStatusResult = {
	statusColor: BudgetStatusColor;
	/** % dias passados menos % orçamento gasto — positivo = gastando mais devagar que o ritmo do mês. */
	slackPct: number;
};

/**
 * Compara o ritmo de gasto com o ritmo do calendário: se você já passou
 * metade dos dias do mês mas só gastou 30% do orçamento, está confortável
 * (slackPct positivo). Se já gastou 70% do orçamento com metade dos dias
 * passados, está no vermelho (slackPct bem negativo). Sem orçamento
 * configurado (monthlyBudgetTotal <= 0), não há base pra calcular — o
 * caller decide o que fazer nesse caso (não chamar / esconder o badge).
 */
export function evaluateBudgetStatus({
	daysElapsed,
	daysInMonth,
	monthlyBudgetTotal,
	spentThisMonth,
	greenThresholdPct,
	yellowThresholdPct,
}: EvaluateBudgetStatusInput): BudgetStatusResult {
	const pctDaysElapsed =
		daysInMonth > 0 ? (daysElapsed / daysInMonth) * 100 : 0;
	const pctBudgetSpent =
		monthlyBudgetTotal > 0 ? (spentThisMonth / monthlyBudgetTotal) * 100 : 0;
	const slackPct = pctDaysElapsed - pctBudgetSpent;

	return {
		statusColor: resolveBudgetStatusColor(slackPct, {
			greenThresholdPct,
			yellowThresholdPct,
		}),
		slackPct,
	};
}

export type EvaluateIncomeWarningInput = {
	monthlyBudgetTotal: number;
	/** Renda prevista do mês (realizada + já lançada futura), magnitude positiva. */
	expectedIncome: number;
};

export type IncomeWarningResult = {
	isOverIncome: boolean;
	/** monthlyBudgetTotal - expectedIncome; positivo = orçamento maior que a renda prevista. */
	difference: number;
};

/**
 * Alerta de segurança: a renda NÃO entra na conta do orçamento diário (foi
 * decisão explícita do usuário) — só é comparada aqui pra avisar quando o
 * orçamento planejado ultrapassa o que ele efetivamente vai receber.
 */
export function evaluateIncomeWarning({
	monthlyBudgetTotal,
	expectedIncome,
}: EvaluateIncomeWarningInput): IncomeWarningResult {
	const difference = monthlyBudgetTotal - expectedIncome;
	return { isOverIncome: difference > 0, difference };
}
