export type SavingsGoalProgressInput = {
	targetAmount: number;
	startingBalance: number;
	currentBalance: number;
};

export type SavingsGoalProgress = {
	progress: number;
	isReached: boolean;
	percent: number;
};

/**
 * Progresso da meta é observado direto do saldo da conta de destino: a diferença
 * entre o saldo atual e o saldo que a conta tinha no momento em que a meta foi criada.
 * Não é um livro-razão de aportes manuais.
 */
export function computeSavingsGoalProgress({
	targetAmount,
	startingBalance,
	currentBalance,
}: SavingsGoalProgressInput): SavingsGoalProgress {
	const progress = currentBalance - startingBalance;
	const isReached =
		targetAmount <= 0 ? progress >= 0 : progress >= targetAmount;
	const percent =
		targetAmount > 0
			? Math.min(Math.max((progress / targetAmount) * 100, 0), 100)
			: progress > 0
				? 100
				: 0;

	return { progress, isReached, percent };
}

function wholeMonthsBetween(from: Date, to: Date): number {
	const months =
		(to.getFullYear() - from.getFullYear()) * 12 +
		(to.getMonth() - from.getMonth());
	return Math.max(months, 0);
}

/**
 * Sugestão informativa de quanto guardar por mês para bater a meta na data alvo.
 * Nunca cria lançamento sozinho. Retorna null quando a meta já foi atingida.
 */
export function computeSuggestedMonthlyContribution({
	targetAmount,
	progress,
	today,
	targetDate,
}: {
	targetAmount: number;
	progress: number;
	today: Date;
	targetDate: Date;
}): number | null {
	if (progress >= targetAmount) {
		return null;
	}

	const remaining = targetAmount - progress;
	const monthsRemaining = Math.max(wholeMonthsBetween(today, targetDate), 1);

	return remaining / monthsRemaining;
}
